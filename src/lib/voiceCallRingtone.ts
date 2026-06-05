/**
 * Ring audio for TalkChat voice calls while unanswered.
 *
 * Desktop: spoken announcements — server TTS when configured, else speechSynthesis.
 *
 * iPhone/iPad (PWA): looping HTML audio ring files under /sounds/. Native apps
 * like KakaoTalk use CallKit and can ring on the lock screen; iOS delivers web
 * push silently, so in-app HTML audio is the only ring path while the app is
 * open. Audio must be primed once per session via any in-app tap (scroll,
 * chat, etc.) before incoming calls can ring.
 */

const INCOMING_RING_URL = '/sounds/incoming-ring.wav'
const OUTGOING_RING_URL = '/sounds/outgoing-ring.wav'
const SILENT_RING_URL = '/sounds/silent.wav'

const LOOP_PAUSE_MS = 2000
export const VOICE_CALL_RING_TIMEOUT_MS = 60000
const IOS_GESTURE_WINDOW_MS = 2500
const IOS_RING_RETRY_MS = 800

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
/** React-mounted ring elements (preferred on iOS over dynamic createElement). */
let iosIncomingRingEl: HTMLAudioElement | null = null
let iosOutgoingRingEl: HTMLAudioElement | null = null
let iosPrimeAudioEl: HTMLAudioElement | null = null
let iosRingActiveDirection: 'incoming' | 'outgoing' | null = null
let iosRingAudioPrimed = false
let iosRingRetryTimer: ReturnType<typeof setInterval> | null = null
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

function stopIosRingRetry() {
  if (iosRingRetryTimer !== null) {
    clearInterval(iosRingRetryTimer)
    iosRingRetryTimer = null
  }
}

function stopIosHtmlRing() {
  stopIosRingRetry()
  iosRingActiveDirection = null
  for (const audio of [iosIncomingRingEl, iosOutgoingRingEl]) {
    if (!audio) continue
    try {
      audio.pause()
      audio.currentTime = 0
      audio.loop = false
    } catch {
      // ignore
    }
  }
}

/** Wire React-mounted <audio> elements (VoiceCallProvider) for reliable iOS playback. */
export function attachIosIncomingRingAudio(el: HTMLAudioElement | null) {
  iosIncomingRingEl = el
}

export function attachIosOutgoingRingAudio(el: HTMLAudioElement | null) {
  iosOutgoingRingEl = el
}

function getIosRingElement(direction: 'incoming' | 'outgoing'): HTMLAudioElement | null {
  const attached = direction === 'incoming' ? iosIncomingRingEl : iosOutgoingRingEl
  if (attached) return attached
  // Fallback if provider audio not mounted yet
  if (typeof document === 'undefined') return null
  const id = direction === 'incoming' ? 'voice-call-incoming-ring' : 'voice-call-outgoing-ring'
  let el = document.getElementById(id) as HTMLAudioElement | null
  if (!el) {
    el = document.createElement('audio')
    el.id = id
    el.setAttribute('playsinline', 'true')
    el.setAttribute('webkit-playsinline', 'true')
    el.preload = 'auto'
    el.style.display = 'none'
    el.src = direction === 'incoming' ? INCOMING_RING_URL : OUTGOING_RING_URL
    document.body.appendChild(el)
  }
  if (direction === 'incoming') iosIncomingRingEl = el
  else iosOutgoingRingEl = el
  return el
}

function isIosHtmlRingPlaying(): boolean {
  if (iosRingActiveDirection === 'incoming' && iosIncomingRingEl) {
    return !iosIncomingRingEl.paused && !iosIncomingRingEl.ended
  }
  if (iosRingActiveDirection === 'outgoing' && iosOutgoingRingEl) {
    return !iosOutgoingRingEl.paused && !iosOutgoingRingEl.ended
  }
  return false
}

function pauseOtherIosRing(direction: 'incoming' | 'outgoing') {
  const other = direction === 'incoming' ? iosOutgoingRingEl : iosIncomingRingEl
  if (!other) return
  try {
    other.pause()
    other.currentTime = 0
  } catch {
    // ignore
  }
}

/** Play a looping ring file on the iOS HTML audio element for this direction. */
function tryPlayIosHtmlRing(direction: 'incoming' | 'outgoing') {
  if (isIosHtmlRingPlaying() && iosRingActiveDirection === direction) return

  const audio = getIosRingElement(direction)
  if (!audio) return

  pauseOtherIosRing(direction)

  try {
    audio.loop = true
    audio.currentTime = 0
    void audio
      .play()
      .then(() => {
        iosRingActiveDirection = direction
        iosRingAudioPrimed = true
        stopIosRingRetry()
      })
      .catch(() => {})
  } catch {
    // ignore
  }
}

function startIosRingRetry(direction: 'incoming' | 'outgoing') {
  stopIosRingRetry()
  iosRingRetryTimer = setInterval(() => {
    if (ringMode !== 'beep' || !lastAnnouncement || ringDirection !== direction) return
    if (isIosHtmlRingPlaying()) {
      stopIosRingRetry()
      return
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([400, 200, 400, 800])
    }
    tryPlayIosHtmlRing(direction)
  }, IOS_RING_RETRY_MS)
}

function runIosHtmlRing(direction: 'incoming' | 'outgoing') {
  tryPlayIosHtmlRing(direction)
  if (direction === 'incoming') startIosRingRetry(direction)
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
  stopIosHtmlRing()
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
 * Flush a pending ring start. iOS HTML beeps always flush; desktop speech on iOS
 * still needs a recent gesture.
 */
function maybeFlushPendingAnnouncement() {
  if (!pendingAnnouncementStart) return
  if (ringMode === 'beep') {
    flushPendingAnnouncement()
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

function getIosPrimeAudio(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null
  if (!iosPrimeAudioEl) {
    const el = document.createElement('audio')
    el.setAttribute('playsinline', 'true')
    el.setAttribute('webkit-playsinline', 'true')
    el.preload = 'auto'
    el.style.display = 'none'
    document.body.appendChild(el)
    iosPrimeAudioEl = el
  }
  return iosPrimeAudioEl
}

async function primeIosHtmlAudio() {
  if (isIosHtmlRingPlaying()) return

  const el = getIosPrimeAudio()
  if (!el) return

  try {
    el.loop = false
    el.src = SILENT_RING_URL
    el.load()
    await el.play()
    el.pause()
    el.currentTime = 0
    iosRingAudioPrimed = true
  } catch {
    // needs user gesture — onUserGesture calls this inside a gesture handler
  }

  // Unlock the React-mounted ring elements (volume 0) so later incoming play()
  // works without a fresh gesture while the app stays open.
  for (const ringEl of [iosIncomingRingEl, iosOutgoingRingEl]) {
    if (!ringEl) continue
    const savedVolume = ringEl.volume
    try {
      ringEl.volume = 0
      ringEl.currentTime = 0
      await ringEl.play()
      ringEl.pause()
      ringEl.currentTime = 0
      iosRingAudioPrimed = true
    } catch {
      // ignore — element may not be mounted yet
    } finally {
      ringEl.volume = savedVolume
    }
  }
}

async function onUserGesture() {
  lastUserGestureAt = Date.now()
  await primeIosHtmlAudio()
  await unlockVoiceCallAudio()
  if (pendingAnnouncementStart) {
    flushPendingAnnouncement()
    return
  }
  if (
    lastAnnouncement &&
    isIosDevice() &&
    !isIosHtmlRingPlaying() &&
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
    (loopScheduleTimer !== null ||
      isIosHtmlRingPlaying() ||
      iosRingRetryTimer !== null ||
      pendingAnnouncementStart !== null)
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

  // iPhone/iPad: looping HTML audio ring files (never prime silent here — that
  // breaks play() on incoming calls that arrive without a fresh gesture).
  if (isIosDevice()) {
    ringMode = 'beep'
    pendingAnnouncementStart = () => runIosHtmlRing(direction)
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

  const loopRunning =
    loopScheduleTimer !== null || isIosHtmlRingPlaying() || iosRingRetryTimer !== null
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
