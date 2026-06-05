/**
 * Spoken voice announcements for TalkChat voice calls while ringing (no beep tones).
 * Incoming: "Call from {name}". Outgoing: "Calling {name}".
 *
 * Preferred path: server-side TTS (/api/chat/voice/tts) decoded into an
 * AudioBuffer and looped through the unlocked AudioContext. iOS allows that
 * without a fresh gesture (once the context is unlocked), so incoming calls can
 * ring before the user touches the screen.
 *
 * Fallback path: on-device speechSynthesis. iOS Safari/PWA blocks speech until
 * an in-page gesture — notification taps do not count — so the fallback can only
 * speak after the first touch. Use installVoiceCallAudioUnlock() at startup.
 */

/** Tiny silent WAV — primes iOS HTML audio output on first user tap. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

const LOOP_PAUSE_MS = 2000
// How long an unanswered call rings before it is dropped automatically. The iOS
// single-utterance block is sized to cover this, and useVoiceCall ends/rejects
// the call when it elapses.
export const VOICE_CALL_RING_TIMEOUT_MS = 60000
// iOS only honors speechSynthesis.speak() shortly after a real in-page gesture.
const IOS_GESTURE_WINDOW_MS = 2500

let audioContext: AudioContext | null = null
let unlockListenersInstalled = false
let loopGeneration = 0
let loopScheduleTimer: ReturnType<typeof setTimeout> | null = null
let iosKeepAliveTimer: ReturnType<typeof setInterval> | null = null
let iosSpeakNonce = 0
let lastUserGestureAt = 0
let lastAnnouncement: string | null = null
let lastLang: string | undefined
let pendingAnnouncementStart: (() => void) | null = null
let openedFromCallNotification = false
let ttsActiveSource: AudioBufferSourceNode | null = null
let ttsUnavailable = false
const ttsBufferCache = new Map<string, AudioBuffer>()
let speechPrimed = false

type AudioContextCtor = typeof AudioContext

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { webkitAudioContext?: AudioContextCtor }
  return window.AudioContext || w.webkitAudioContext || null
}

function getAudioContext(): AudioContext | null {
  if (!audioContext) {
    const Ctor = getAudioContextCtor()
    if (!Ctor) return null
    try {
      audioContext = new Ctor()
    } catch {
      return null
    }
  }
  return audioContext
}

function isAudioContextRunning(ctx: AudioContext): boolean {
  return ctx.state === 'running'
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function clearLoopScheduleTimer() {
  if (loopScheduleTimer !== null) {
    clearTimeout(loopScheduleTimer)
    loopScheduleTimer = null
  }
}

function stopIosSpeechKeepAlive() {
  if (iosKeepAliveTimer !== null) {
    clearInterval(iosKeepAliveTimer)
    iosKeepAliveTimer = null
  }
}

function hasRecentUserGesture(): boolean {
  return Date.now() - lastUserGestureAt < IOS_GESTURE_WINDOW_MS
}

function startIosSpeechKeepAlive() {
  if (!isIosDevice() || iosKeepAliveTimer !== null) return
  iosKeepAliveTimer = setInterval(() => {
    const synth = window.speechSynthesis
    if (!synth?.speaking) return
    synth.pause()
    synth.resume()
  }, 4000)
}

function stopTtsPlayback() {
  if (!ttsActiveSource) return
  try {
    ttsActiveSource.onended = null
    ttsActiveSource.stop()
  } catch {
    // already stopped
  }
  try {
    ttsActiveSource.disconnect()
  } catch {
    // ignore
  }
  ttsActiveSource = null
}

function stopSpeech() {
  loopGeneration += 1
  iosSpeakNonce += 1
  clearLoopScheduleTimer()
  stopIosSpeechKeepAlive()
  stopTtsPlayback()
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

/** Fetch + decode server TTS audio for an announcement; null when unavailable. */
async function getTtsBuffer(text: string, lang?: string): Promise<AudioBuffer | null> {
  if (ttsUnavailable || typeof fetch === 'undefined') return null
  const ctx = getAudioContext()
  if (!ctx) return null

  const key = `${lang || ''}::${text}`
  const cached = ttsBufferCache.get(key)
  if (cached) return cached

  try {
    const params = new URLSearchParams({ text })
    if (lang) params.set('lang', lang)
    const res = await fetch(`/api/chat/voice/tts?${params.toString()}`, { cache: 'force-cache' })
    if (res.status === 503) {
      // Not configured server-side — stop trying for this session.
      ttsUnavailable = true
      return null
    }
    if (!res.ok) return null
    const arrayBuffer = await res.arrayBuffer()
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
    ttsBufferCache.set(key, buffer)
    return buffer
  } catch {
    return null
  }
}

/** Loop a decoded TTS buffer with ~LOOP_PAUSE_MS gaps via the AudioContext. */
function playTtsLoop(buffer: AudioBuffer, generation: number) {
  const ctx = getAudioContext()
  if (!ctx) return
  void ctx.resume?.().catch(() => {})

  const playOnce = () => {
    if (generation !== loopGeneration || !lastAnnouncement) return
    try {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start()
      ttsActiveSource = source
    } catch {
      // ignore transient playback errors; the timer below retries
    }
    const delay = buffer.duration * 1000 + LOOP_PAUSE_MS
    loopScheduleTimer = setTimeout(playOnce, delay)
  }

  playOnce()
}

function flushPendingAnnouncement() {
  if (!pendingAnnouncementStart) return
  const start = pendingAnnouncementStart
  pendingAnnouncementStart = null
  start()
}

/**
 * Flush a pending announcement, but on iOS only when a real user gesture
 * happened recently. iOS blocks speechSynthesis without a fresh gesture even
 * when the AudioContext is already running, so flushing otherwise would
 * "speak" into the void and consume the pending start.
 */
function maybeFlushPendingAnnouncement() {
  if (!pendingAnnouncementStart) return
  if (isIosDevice() && !hasRecentUserGesture()) return
  flushPendingAnnouncement()
}

/** Resume Web Audio after a user gesture (required on iOS for call audio). */
export async function unlockVoiceCallAudio(): Promise<boolean> {
  const ctx = getAudioContext()
  if (!ctx) return false

  try {
    if (!isAudioContextRunning(ctx)) {
      await ctx.resume()
    }
  } catch {
    return false
  }

  if (!isAudioContextRunning(ctx)) return false
  // AudioContext running does not mean iOS will speak — that needs a fresh
  // gesture, so only flush when one happened recently (real gesture / outgoing).
  maybeFlushPendingAnnouncement()
  return true
}

function primeIosHtmlAudio() {
  if (typeof document === 'undefined') return
  const audio = document.createElement('audio')
  audio.setAttribute('playsinline', 'true')
  audio.src = SILENT_WAV
  void audio.play().catch(() => {})
}

function onUserGesture() {
  lastUserGestureAt = Date.now()
  primeIosHtmlAudio()
  primeSpeechSynthesis()
  void unlockVoiceCallAudio()
  if (pendingAnnouncementStart) {
    flushPendingAnnouncement()
    return
  }
  if (
    lastAnnouncement &&
    isIosDevice() &&
    loopScheduleTimer === null &&
    iosKeepAliveTimer === null &&
    pendingAnnouncementStart === null
  ) {
    retryVoiceCallAnnouncement()
  }
}

/** Call once at app startup so the first tap unlocks audio for later calls. */
export function installVoiceCallAudioUnlock() {
  if (typeof document === 'undefined' || unlockListenersInstalled) return
  unlockListenersInstalled = true

  document.addEventListener('touchstart', onUserGesture, { passive: true, capture: true })
  document.addEventListener('pointerdown', onUserGesture, { passive: true, capture: true })
  document.addEventListener('click', onUserGesture, { capture: true })
  document.addEventListener('keydown', onUserGesture, { capture: true })
}

/** App opened from an incoming-call push notification (cold start). */
export function markOpenedFromCallNotification() {
  openedFromCallNotification = true
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('voiceCallNotificationOpen', '1')
  }
}

function wasOpenedFromCallNotification() {
  if (openedFromCallNotification) return true
  if (typeof sessionStorage === 'undefined') return false
  return sessionStorage.getItem('voiceCallNotificationOpen') === '1'
}

function clearOpenedFromCallNotification() {
  openedFromCallNotification = false
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('voiceCallNotificationOpen')
  }
}

/** Prime audio after opening the PWA from a notification (pageshow / visibility). */
export function primeVoiceCallAfterNotificationOpen() {
  if (!wasOpenedFromCallNotification() && !lastAnnouncement) return
  primeIosHtmlAudio()
  void unlockVoiceCallAudio()
  // On iOS this only speaks if a real gesture happened recently; otherwise it
  // stays pending until the user's first touch (see maybeFlushPendingAnnouncement).
  maybeFlushPendingAnnouncement()
  if (lastAnnouncement && (!isIosDevice() || hasRecentUserGesture())) {
    void startVoiceAnnouncement(lastAnnouncement, lastLang)
    clearOpenedFromCallNotification()
  }
}

/** Stop any playing spoken announcement. */
export function stopVoiceCallRingtone() {
  stopSpeech()
  pendingAnnouncementStart = null
  lastAnnouncement = null
  lastLang = undefined
}

function estimateSpeechDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(2200, words * 450)
}

/**
 * Unlock iOS speechSynthesis by speaking a muted empty utterance inside a user
 * gesture. Once this "trusted session" is created, later speak() calls from
 * timers (our ring loop) are honored on iOS — otherwise WebKit silently drops
 * any speak() not tied to a gesture. Safe/no-op on other browsers.
 */
function primeSpeechSynthesis() {
  if (speechPrimed) return
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  if (!synth) return
  try {
    const utterance = new SpeechSynthesisUtterance('')
    utterance.volume = 0
    synth.speak(utterance)
    speechPrimed = true
  } catch {
    // ignore
  }
}

/**
 * Speak the announcement on a loop with an exact LOOP_PAUSE_MS gap of silence
 * between repeats (matching the PC cadence). The next repeat is scheduled from
 * onend/onerror (so the pause starts when speech actually finishes); a backup
 * timer advances the loop if those events never fire. iOS honors the timer-
 * driven speak() because the engine was primed on the first gesture.
 */
function runAnnouncementLoop(announcement: string, lang: string | undefined, generation: number) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  if (!synth) return

  if (isIosDevice()) startIosSpeechKeepAlive()
  const phrase = announcement.trim()
  if (!phrase) return

  const speakNext = () => {
    if (generation !== loopGeneration || !lastAnnouncement) return
    const myNonce = ++iosSpeakNonce

    if (isIosDevice()) {
      try {
        synth.getVoices()
      } catch {
        // ignore
      }
    }

    const advance = () => {
      if (myNonce !== iosSpeakNonce) return // already advanced (onend vs backup)
      if (generation !== loopGeneration || !lastAnnouncement) return
      iosSpeakNonce += 1 // invalidate the backup timer for this utterance
      clearLoopScheduleTimer()
      loopScheduleTimer = setTimeout(speakNext, LOOP_PAUSE_MS)
    }

    const utterance = new SpeechSynthesisUtterance(phrase)
    if (lang) utterance.lang = lang
    utterance.onend = advance
    utterance.onerror = advance
    synth.speak(utterance)

    // Backup: if the utterance is silently dropped (no onend/onerror), keep the
    // loop alive so a later gesture-primed speak() can start ringing.
    clearLoopScheduleTimer()
    loopScheduleTimer = setTimeout(advance, estimateSpeechDurationMs(phrase) + LOOP_PAUSE_MS + 1500)
  }

  speakNext()
}

function isSameAnnouncementRunning(announcement: string, lang?: string) {
  return (
    announcement === lastAnnouncement &&
    lang === lastLang &&
    (loopScheduleTimer !== null ||
      iosKeepAliveTimer !== null ||
      pendingAnnouncementStart !== null)
  )
}

async function startVoiceAnnouncement(announcement: string, lang?: string) {
  if (isSameAnnouncementRunning(announcement, lang)) return

  stopVoiceCallRingtone()
  lastAnnouncement = announcement
  lastLang = lang
  const generation = loopGeneration

  if (typeof window !== 'undefined') primeIosHtmlAudio()

  // Preferred: server TTS looped through the AudioContext (works on iOS without
  // a fresh gesture once the context is unlocked, so incoming rings before any
  // touch). The fetch is cached after the first call for a given name.
  const buffer = await getTtsBuffer(announcement, lang)
  if (generation !== loopGeneration) return // superseded while fetching

  if (buffer) {
    pendingAnnouncementStart = () => playTtsLoop(buffer, loopGeneration)

    const ctx = getAudioContext()
    if (ctx && !isAudioContextRunning(ctx)) {
      try {
        await ctx.resume()
      } catch {
        // needs a gesture — onUserGesture will resume + flush
      }
      if (generation !== loopGeneration) return
    }
    if (ctx && isAudioContextRunning(ctx)) {
      flushPendingAnnouncement()
      clearOpenedFromCallNotification()
    }
    return
  }

  // Fallback: on-device speechSynthesis (gesture-gated on iOS).
  pendingAnnouncementStart = () => runAnnouncementLoop(announcement, lang, loopGeneration)

  if (isIosDevice()) {
    void unlockVoiceCallAudio()
    // iOS needs a *recent* in-page gesture to speak. Outgoing calls start right
    // after the user taps "Call", so a gesture is fresh and we speak now.
    // Incoming calls arrive with no gesture (poll / push), so we keep the
    // announcement pending until the user's first touch (see onUserGesture).
    if (hasRecentUserGesture()) {
      flushPendingAnnouncement()
      clearOpenedFromCallNotification()
    }
    return
  }

  await unlockVoiceCallAudio()

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    flushPendingAnnouncement()
    return
  }
}

/** Callee: repeat spoken announcement while incoming call is unanswered. */
export function startIncomingRingtone(announcement: string, lang?: string) {
  void startVoiceAnnouncement(announcement, lang)
}

/** Caller: repeat spoken announcement while waiting for the other person to answer. */
export function startOutgoingRingback(announcement: string, lang?: string) {
  void startVoiceAnnouncement(announcement, lang)
}

/** Retry the last announcement (e.g. after mic opens on iOS or tab becomes visible). */
export function retryVoiceCallAnnouncement() {
  if (!lastAnnouncement) return

  // On iOS, never tear down a healthy running loop when there's no fresh gesture:
  // the loop self-heals via its watchdog, and restarting would set it back to
  // "pending" and silence it until the next touch.
  const loopRunning = iosKeepAliveTimer !== null || loopScheduleTimer !== null
  if (isIosDevice() && loopRunning && !hasRecentUserGesture()) return

  const announcement = lastAnnouncement
  const lang = lastLang
  stopVoiceCallRingtone()
  lastAnnouncement = announcement
  lastLang = lang
  void startVoiceAnnouncement(announcement, lang)
}
