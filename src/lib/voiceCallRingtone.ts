/**
 * Spoken voice announcements for TalkChat voice calls while ringing (no beep tones).
 * Incoming: "Call from {name}". Outgoing: "Calling {name}".
 *
 * iOS Safari/PWA blocks speech until an in-page gesture — notification taps do not
 * count. Use installVoiceCallAudioUnlock() at startup; opening from a push notification
 * primes audio on pageshow and retries after the first touch.
 */

/** Tiny silent WAV — primes iOS HTML audio output on first user tap. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

const LOOP_PAUSE_MS = 2000
const IOS_SPEECH_RETRY_MS = 2000
const IOS_SPEECH_RETRY_MAX = 30

let audioContext: AudioContext | null = null
let unlockListenersInstalled = false
let loopGeneration = 0
let loopScheduleTimer: ReturnType<typeof setTimeout> | null = null
let iosKeepAliveTimer: ReturnType<typeof setInterval> | null = null
let iosSpeechRetryTimer: ReturnType<typeof setInterval> | null = null
let lastAnnouncement: string | null = null
let lastLang: string | undefined
let pendingAnnouncementStart: (() => void) | null = null
let openedFromCallNotification = false

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

function stopIosSpeechRetry() {
  if (iosSpeechRetryTimer !== null) {
    clearInterval(iosSpeechRetryTimer)
    iosSpeechRetryTimer = null
  }
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

function stopSpeech() {
  loopGeneration += 1
  clearLoopScheduleTimer()
  stopIosSpeechKeepAlive()
  stopIosSpeechRetry()
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

function flushPendingAnnouncement() {
  if (!pendingAnnouncementStart) return
  const start = pendingAnnouncementStart
  pendingAnnouncementStart = null
  start()
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
  flushPendingAnnouncement()
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
  flushPendingAnnouncement()
  if (lastAnnouncement) {
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

function speakAnnouncementOnce(text: string, lang?: string) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  if (!synth || !text.trim()) return

  if (isIosDevice()) {
    synth.getVoices()
  }

  const utterance = new SpeechSynthesisUtterance(text.trim())
  if (lang) utterance.lang = lang
  synth.speak(utterance)
}

function startIosSpeechRetry(announcement: string, lang: string | undefined, generation: number) {
  stopIosSpeechRetry()
  if (!isIosDevice()) return

  let attempts = 0
  iosSpeechRetryTimer = setInterval(() => {
    if (generation !== loopGeneration || !lastAnnouncement) {
      stopIosSpeechRetry()
      return
    }
    if (attempts++ >= IOS_SPEECH_RETRY_MAX) {
      stopIosSpeechRetry()
      return
    }

    const synth = window.speechSynthesis
    if (synth?.speaking || synth?.pending) return

    speakAnnouncementOnce(announcement, lang)
  }, IOS_SPEECH_RETRY_MS)
}

function runAnnouncementLoop(announcement: string, lang: string | undefined, generation: number) {
  startIosSpeechKeepAlive()
  if (isIosDevice()) {
    startIosSpeechRetry(announcement, lang, generation)
  }

  const scheduleNext = () => {
    if (generation !== loopGeneration) {
      stopIosSpeechKeepAlive()
      stopIosSpeechRetry()
      return
    }

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
    (loopScheduleTimer !== null || iosKeepAliveTimer !== null || pendingAnnouncementStart !== null)
  )
}

async function startVoiceAnnouncement(announcement: string, lang?: string) {
  if (isSameAnnouncementRunning(announcement, lang)) return

  stopVoiceCallRingtone()
  lastAnnouncement = announcement
  lastLang = lang

  const start = () => {
    const generation = loopGeneration
    runAnnouncementLoop(announcement, lang, generation)
  }

  pendingAnnouncementStart = start

  if (isIosDevice()) {
    primeIosHtmlAudio()
    const unlocked = await unlockVoiceCallAudio()
    if (unlocked) {
      flushPendingAnnouncement()
      clearOpenedFromCallNotification()
      return
    }
    // Wait for first in-page touch (notification tap does not unlock iOS speech).
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
  const announcement = lastAnnouncement
  const lang = lastLang
  stopVoiceCallRingtone()
  lastAnnouncement = announcement
  lastLang = lang
  void startVoiceAnnouncement(announcement, lang)
}
