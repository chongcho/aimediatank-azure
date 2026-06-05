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
// How long an unanswered call rings before it is dropped automatically. The iOS
// single-utterance block is sized to cover this, and useVoiceCall ends/rejects
// the call when it elapses.
export const VOICE_CALL_RING_TIMEOUT_MS = 60000
// iOS only honors speechSynthesis.speak() shortly after a real in-page gesture.
const IOS_GESTURE_WINDOW_MS = 2500
// Approx. silence Apple TTS adds per sentence-break ". " beat. Used to match the
// ~LOOP_PAUSE_MS gap the PC loop leaves between repeats (iOS can't use timers).
const IOS_PAUSE_BEAT_MS = 500

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

function stopSpeech() {
  loopGeneration += 1
  iosSpeakNonce += 1
  clearLoopScheduleTimer()
  stopIosSpeechKeepAlive()
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

/**
 * Repeat the phrase inside one utterance, with a ~LOOP_PAUSE_MS gap between
 * repeats so the iPhone cadence matches the PC loop. iOS can't time speak()
 * calls, so the pause is built from sentence-break ". " beats (each ~IOS_PAUSE_
 * BEAT_MS of silence on Apple voices, never spoken aloud).
 */
function buildRepeatedAnnouncement(text: string, repeats: number): string {
  const phrase = text.trim().replace(/\s+/g, ' ').replace(/[.\s]+$/, '')
  const beats = Math.max(1, Math.round(LOOP_PAUSE_MS / IOS_PAUSE_BEAT_MS))
  // e.g. "Calling John. . . ." → speak phrase, then ~beats of silent pause.
  const separator = '.' + ' .'.repeat(beats) + ' '
  return Array.from({ length: repeats }, () => phrase).join(separator) + '.'
}

/**
 * iOS-specific ring loop. iOS blocks speechSynthesis.speak() when it is called
 * from a timer (setTimeout/setInterval) — only calls tied to the speech session
 * itself are honored. So we never schedule speak() from a timer: a single
 * gesture-triggered utterance repeats the phrase many times, and onend/onerror
 * re-speaks the next block synchronously (allowed on iOS) for longer calls. The
 * pause/resume keep-alive guards against the iOS long-utterance cutoff.
 */
function runIosAnnouncementLoop(announcement: string, lang: string | undefined, generation: number) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  if (!synth) return

  startIosSpeechKeepAlive()

  // Size the single utterance to cover the ~60s ring window. Each repeat takes
  // about the same as the PC loop's per-repeat delay (speech + pause), so the
  // whole block runs ~VOICE_CALL_RING_TIMEOUT_MS; onend re-chains as a backup.
  const perRepeatMs = estimateSpeechDurationMs(announcement) + LOOP_PAUSE_MS
  const repeats = Math.max(1, Math.ceil(VOICE_CALL_RING_TIMEOUT_MS / perRepeatMs))
  const block = buildRepeatedAnnouncement(announcement, repeats)

  const speakBlock = () => {
    if (generation !== loopGeneration || !lastAnnouncement) return
    const myNonce = ++iosSpeakNonce

    try {
      synth.getVoices()
    } catch {
      // ignore
    }

    const utterance = new SpeechSynthesisUtterance(block)
    if (lang) utterance.lang = lang

    const chainNext = () => {
      // Ignore end/error of superseded utterances or a stopped/changed ring.
      if (myNonce !== iosSpeakNonce) return
      if (generation !== loopGeneration || !lastAnnouncement) return
      // Re-speak synchronously inside the end handler (NOT via setTimeout, which
      // iOS would block) so the announcement keeps repeating until accept/cancel.
      speakBlock()
    }

    utterance.onend = chainNext
    utterance.onerror = chainNext
    synth.speak(utterance)
  }

  speakBlock()
}

function runAnnouncementLoop(announcement: string, lang: string | undefined, generation: number) {
  if (isIosDevice()) {
    runIosAnnouncementLoop(announcement, lang, generation)
    return
  }

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
      iosKeepAliveTimer !== null ||
      pendingAnnouncementStart !== null)
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
