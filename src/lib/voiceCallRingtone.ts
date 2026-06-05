/**
 * Ring audio for TalkChat voice calls while unanswered.
 *
 * Desktop: spoken announcements — server TTS when configured, else speechSynthesis.
 *
 * iPhone/iPad: looping HTML audio beep patterns (Web Audio stays suspended on
 * incoming calls without a gesture). Incoming = double-beep ring; outgoing =
 * single ringback beep every ~2s. Prime audio with installVoiceCallAudioUnlock()
 * so the first in-app tap unlocks rings for later incoming calls.
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
// iPhone ring beeps via HTML audio (works after one in-app tap primes output).
const INCOMING_BEEP_HZ = 880
const INCOMING_BEEP_MS = 320
const INCOMING_DOUBLE_GAP_MS = 300
const OUTGOING_BEEP_HZ = 440
const OUTGOING_BEEP_MS = 380
const BEEP_VOLUME = 0.28

type WavSegment = { type: 'tone' | 'silence'; hz?: number; ms: number }

/** Build a short WAV data URI (tone + silence segments) for HTML audio on iOS. */
function makeRingWavDataUri(segments: WavSegment[]): string {
  const sampleRate = 44100
  const numSamples = segments.reduce(
    (sum, s) => sum + Math.floor((sampleRate * s.ms) / 1000),
    0,
  )
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, numSamples * 2, true)

  let offset = 0
  for (const segment of segments) {
    const count = Math.floor((sampleRate * segment.ms) / 1000)
    for (let i = 0; i < count; i++) {
      let sample = 0
      if (segment.type === 'tone' && segment.hz) {
        sample = Math.sin((2 * Math.PI * segment.hz * i) / sampleRate) * BEEP_VOLUME
      }
      view.setInt16(44 + (offset + i) * 2, Math.max(-32767, Math.min(32767, sample * 32767)), true)
    }
    offset += count
  }

  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return `data:audio/wav;base64,${btoa(binary)}`
}

const INCOMING_RING_WAV = makeRingWavDataUri([
  { type: 'tone', hz: INCOMING_BEEP_HZ, ms: INCOMING_BEEP_MS },
  { type: 'silence', ms: INCOMING_DOUBLE_GAP_MS },
  { type: 'tone', hz: INCOMING_BEEP_HZ, ms: INCOMING_BEEP_MS },
  { type: 'silence', ms: LOOP_PAUSE_MS },
])
const OUTGOING_RING_WAV = makeRingWavDataUri([
  { type: 'tone', hz: OUTGOING_BEEP_HZ, ms: OUTGOING_BEEP_MS },
  { type: 'silence', ms: LOOP_PAUSE_MS },
])

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
let iosRingAudio: HTMLAudioElement | null = null
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
  if (!iosRingAudio) return
  try {
    iosRingAudio.pause()
    iosRingAudio.currentTime = 0
    iosRingAudio.loop = false
    iosRingAudio.removeAttribute('src')
    iosRingAudio.load()
  } catch {
    // ignore
  }
}

function getIosRingAudio(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null
  if (!iosRingAudio) {
    const audio = document.createElement('audio')
    audio.setAttribute('playsinline', 'true')
    audio.setAttribute('webkit-playsinline', 'true')
    audio.preload = 'auto'
    audio.style.display = 'none'
    document.body.appendChild(audio)
    iosRingAudio = audio
  }
  return iosRingAudio
}

function isIosHtmlRingPlaying(): boolean {
  return Boolean(iosRingAudio && !iosRingAudio.paused && !iosRingAudio.ended)
}

/** Play a looping ring WAV on the persistent iOS HTML audio element. */
function tryPlayIosHtmlRing(direction: 'incoming' | 'outgoing') {
  const audio = getIosRingAudio()
  if (!audio) return

  const src = direction === 'incoming' ? INCOMING_RING_WAV : OUTGOING_RING_WAV
  if (isIosHtmlRingPlaying() && audio.src === src) return

  try {
    audio.pause()
    audio.loop = true
    audio.src = src
    audio.currentTime = 0
    audio.load()
    void audio.play().then(() => stopIosRingRetry()).catch(() => {})
  } catch {
    // ignore
  }
}

function startIosRingRetry(direction: 'incoming' | 'outgoing') {
  stopIosRingRetry()
  // Incoming often arrives without a gesture — keep trying until play succeeds
  // (e.g. after the user scrolls/taps, or AudioContext unlock completes).
  iosRingRetryTimer = setInterval(() => {
    if (ringMode !== 'beep' || !lastAnnouncement) return
    if (isIosHtmlRingPlaying()) {
      stopIosRingRetry()
      return
    }
    void unlockVoiceCallAudio()
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([300, 150, 300, 600])
    }
    tryPlayIosHtmlRing(direction)
  }, 1200)
}

function runIosHtmlRing(direction: 'incoming' | 'outgoing') {
  void unlockVoiceCallAudio()
  tryPlayIosHtmlRing(direction)
  if (direction === 'incoming' && !isIosHtmlRingPlaying()) startIosRingRetry(direction)
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

function primeIosHtmlAudio() {
  if (isIosHtmlRingPlaying()) return
  const audio = getIosRingAudio()
  if (!audio) return
  audio.loop = false
  audio.src = SILENT_WAV
  void audio.play().catch(() => {})
}

async function onUserGesture() {
  lastUserGestureAt = Date.now()
  primeIosHtmlAudio()
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

  if (isIosDevice()) getIosRingAudio()

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

  if (typeof window !== 'undefined') primeIosHtmlAudio()

  // iPhone/iPad: looping HTML audio ring (Web Audio stays suspended on incoming).
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
