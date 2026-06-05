/**
 * Ring audio for TalkChat voice calls while unanswered.
 *
 * Desktop: spoken announcements — server TTS when configured, else speechSynthesis.
 *
 * iPhone/iPad: Web Audio beep patterns (speechSynthesis is unreliable on iOS).
 * Incoming uses a double-beep ring; outgoing uses a single ringback beep every
 * ~2s. Beeps loop via timers once the AudioContext is running, which does not
 * need a fresh gesture the way speechSynthesis does.
 *
 * Use installVoiceCallAudioUnlock() at startup so the first in-app tap unlocks
 * audio for later incoming rings while the app stays open.
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
// iPhone ring beeps (Web Audio — reliable once AudioContext is unlocked).
const INCOMING_BEEP_HZ = 880
const INCOMING_BEEP_MS = 320
const INCOMING_DOUBLE_GAP_MS = 300
const OUTGOING_BEEP_HZ = 440
const OUTGOING_BEEP_MS = 380
const BEEP_VOLUME = 0.28

let audioContext: AudioContext | null = null
let unlockListenersInstalled = false
let loopGeneration = 0
let loopScheduleTimer: ReturnType<typeof setTimeout> | null = null
let lastUserGestureAt = 0
let lastAnnouncement: string | null = null
let lastLang: string | undefined
let ringDirection: 'incoming' | 'outgoing' = 'outgoing'
let ringMode: 'beep' | 'speech' | 'tts' = 'speech'
let pendingAnnouncementStart: (() => void) | null = null
let openedFromCallNotification = false
let ttsActiveSource: AudioBufferSourceNode | null = null
let ttsUnavailable = false
const ttsBufferCache = new Map<string, AudioBuffer>()

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

function hasRecentUserGesture(): boolean {
  return Date.now() - lastUserGestureAt < IOS_GESTURE_WINDOW_MS
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
  clearLoopScheduleTimer()
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
 * Flush a pending ring start. Beeps only need a running AudioContext; speech on
 * iOS also needs a recent in-page gesture or WebKit silently drops speak().
 */
function maybeFlushPendingAnnouncement() {
  if (!pendingAnnouncementStart) return
  if (ringMode === 'beep') {
    const ctx = getAudioContext()
    if (ctx && isAudioContextRunning(ctx)) flushPendingAnnouncement()
    return
  }
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
  void unlockVoiceCallAudio()
  if (pendingAnnouncementStart) {
    flushPendingAnnouncement()
    return
  }
  if (
    lastAnnouncement &&
    isIosDevice() &&
    loopScheduleTimer === null &&
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
  maybeFlushPendingAnnouncement()
  const announcement = lastAnnouncement
  const canRetry =
    announcement &&
    (!isIosDevice() || ringMode === 'beep' || hasRecentUserGesture())
  if (canRetry) {
    void startVoiceAnnouncement(announcement, lastLang, ringDirection)
    clearOpenedFromCallNotification()
  }
}

/** Stop any playing ring audio. */
export function stopVoiceCallRingtone() {
  stopSpeech()
  pendingAnnouncementStart = null
  lastAnnouncement = null
  lastLang = undefined
  ringMode = 'speech'
}

function playBeep(frequency: number, durationMs: number) {
  const ctx = getAudioContext()
  if (!ctx || !isAudioContextRunning(ctx)) return

  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    const now = ctx.currentTime
    const dur = durationMs / 1000
    osc.frequency.setValueAtTime(frequency, now)
    gain.gain.setValueAtTime(BEEP_VOLUME, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur)
    osc.start(now)
    osc.stop(now + dur)
  } catch {
    // ignore transient playback errors
  }
}

/** Loop beep patterns until accept/cancel (iPhone — timers are reliable here). */
function runBeepLoop(direction: 'incoming' | 'outgoing', generation: number) {
  const playOutgoing = () => {
    if (generation !== loopGeneration || !lastAnnouncement) return
    playBeep(OUTGOING_BEEP_HZ, OUTGOING_BEEP_MS)
    loopScheduleTimer = setTimeout(playOutgoing, OUTGOING_BEEP_MS + LOOP_PAUSE_MS)
  }

  const playIncoming = () => {
    if (generation !== loopGeneration || !lastAnnouncement) return
    playBeep(INCOMING_BEEP_HZ, INCOMING_BEEP_MS)
    loopScheduleTimer = setTimeout(() => {
      if (generation !== loopGeneration || !lastAnnouncement) return
      playBeep(INCOMING_BEEP_HZ, INCOMING_BEEP_MS)
      loopScheduleTimer = setTimeout(playIncoming, INCOMING_BEEP_MS + LOOP_PAUSE_MS)
    }, INCOMING_BEEP_MS + INCOMING_DOUBLE_GAP_MS)
  }

  if (direction === 'incoming') playIncoming()
  else playOutgoing()
}

function estimateSpeechDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(2200, words * 450)
}

function speakAnnouncementOnce(text: string, lang?: string) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  if (!synth || !text.trim()) return

  const utterance = new SpeechSynthesisUtterance(text.trim())
  if (lang) utterance.lang = lang
  synth.speak(utterance)
}

function runAnnouncementLoop(announcement: string, lang: string | undefined, generation: number) {
  const scheduleNext = () => {
    if (generation !== loopGeneration) return

    speakAnnouncementOnce(announcement, lang)
    const delay = estimateSpeechDurationMs(announcement) + LOOP_PAUSE_MS
    loopScheduleTimer = setTimeout(scheduleNext, delay)
  }

  scheduleNext()
}

function isSameAnnouncementRunning(announcement: string, lang?: string) {
  return (
    announcement === lastAnnouncement &&
    lang === lastLang &&
    (loopScheduleTimer !== null || pendingAnnouncementStart !== null)
  )
}

async function startVoiceAnnouncement(
  announcement: string,
  lang: string | undefined,
  direction: 'incoming' | 'outgoing',
) {
  if (isSameAnnouncementRunning(announcement, lang)) return

  stopVoiceCallRingtone()
  lastAnnouncement = announcement
  lastLang = lang
  ringDirection = direction
  const generation = loopGeneration

  if (typeof window !== 'undefined') primeIosHtmlAudio()

  // iPhone/iPad: beep ring — speechSynthesis repeats too fast and incoming
  // calls are often silent without a fresh gesture.
  if (isIosDevice()) {
    ringMode = 'beep'
    pendingAnnouncementStart = () => runBeepLoop(direction, loopGeneration)

    const ctx = getAudioContext()
    if (ctx && !isAudioContextRunning(ctx)) {
      try {
        await ctx.resume()
      } catch {
        // stays pending until onUserGesture unlocks audio
      }
      if (generation !== loopGeneration) return
    }
    maybeFlushPendingAnnouncement()
    clearOpenedFromCallNotification()
    return
  }

  // Desktop: server TTS looped through the AudioContext when configured.
  const buffer = await getTtsBuffer(announcement, lang)
  if (generation !== loopGeneration) return // superseded while fetching

  if (buffer) {
    ringMode = 'tts'
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

  // Fallback: on-device speechSynthesis.
  ringMode = 'speech'
  pendingAnnouncementStart = () => runAnnouncementLoop(announcement, lang, loopGeneration)

  await unlockVoiceCallAudio()

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    flushPendingAnnouncement()
    return
  }
}

/** Callee: ring while incoming call is unanswered. */
export function startIncomingRingtone(announcement: string, lang?: string) {
  void startVoiceAnnouncement(announcement, lang, 'incoming')
}

/** Caller: ringback while waiting for the other person to answer. */
export function startOutgoingRingback(announcement: string, lang?: string) {
  void startVoiceAnnouncement(announcement, lang, 'outgoing')
}

/** Retry the last announcement (e.g. after mic opens on iOS or tab becomes visible). */
export function retryVoiceCallAnnouncement() {
  if (!lastAnnouncement) return

  const loopRunning = loopScheduleTimer !== null
  if (isIosDevice() && ringMode === 'beep' && loopRunning) return
  if (isIosDevice() && ringMode === 'speech' && loopRunning && !hasRecentUserGesture()) return

  const announcement = lastAnnouncement
  const lang = lastLang
  const direction = ringDirection
  stopVoiceCallRingtone()
  lastAnnouncement = announcement
  lastLang = lang
  ringDirection = direction
  void startVoiceAnnouncement(announcement, lang, direction)
}
