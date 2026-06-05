/**
 * Spoken voice announcements for TalkChat voice calls while ringing (no beep tones).
 * Incoming: "Call from {name}". Outgoing: "Calling {name}".
 *
 * iOS Safari/PWA may block audio until a user gesture — use installVoiceCallAudioUnlock()
 * at app startup and retry when a call rings.
 */

/** Tiny silent WAV — primes iOS HTML audio output on first user tap. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

const LOOP_PAUSE_MS = 2000

let audioContext: AudioContext | null = null
let unlockListenersInstalled = false
let loopGeneration = 0
let loopPauseTimer: ReturnType<typeof setTimeout> | null = null
let lastAnnouncement: string | null = null
let lastLang: string | undefined
let pendingAnnouncementStart: (() => void) | null = null

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

function clearLoopPauseTimer() {
  if (loopPauseTimer !== null) {
    clearTimeout(loopPauseTimer)
    loopPauseTimer = null
  }
}

function stopSpeech() {
  loopGeneration += 1
  clearLoopPauseTimer()
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

/** Call once at app startup so the first tap unlocks audio for later calls. */
export function installVoiceCallAudioUnlock() {
  if (typeof document === 'undefined' || unlockListenersInstalled) return
  unlockListenersInstalled = true

  const onGesture = () => {
    primeIosHtmlAudio()
    void unlockVoiceCallAudio()
    flushPendingAnnouncement()
  }

  document.addEventListener('touchstart', onGesture, { passive: true, capture: true })
  document.addEventListener('pointerdown', onGesture, { passive: true, capture: true })
  document.addEventListener('click', onGesture, { capture: true })
  document.addEventListener('keydown', onGesture, { capture: true })
}

/** Stop any playing spoken announcement. */
export function stopVoiceCallRingtone() {
  stopSpeech()
  pendingAnnouncementStart = null
  lastAnnouncement = null
  lastLang = undefined
}

function speakOnce(text: string, lang?: string): Promise<void> {
  return new Promise((resolve) => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
    if (!synth || !text.trim()) {
      resolve()
      return
    }

    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text.trim())
    if (lang) utterance.lang = lang
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    synth.speak(utterance)
  })
}

async function runAnnouncementLoop(announcement: string, lang: string | undefined, generation: number) {
  while (generation === loopGeneration) {
    await speakOnce(announcement, lang)
    if (generation !== loopGeneration) break

    await new Promise<void>((resolve) => {
      loopPauseTimer = setTimeout(() => {
        loopPauseTimer = null
        resolve()
      }, LOOP_PAUSE_MS)
    })
  }
}

async function startVoiceAnnouncement(announcement: string, lang?: string) {
  stopVoiceCallRingtone()
  lastAnnouncement = announcement
  lastLang = lang

  const start = () => {
    const generation = loopGeneration
    void runAnnouncementLoop(announcement, lang, generation)
  }

  await unlockVoiceCallAudio()

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    start()
    return
  }

  pendingAnnouncementStart = start
}

/** Callee: repeat spoken announcement while incoming call is unanswered. */
export function startIncomingRingtone(announcement: string, lang?: string) {
  void startVoiceAnnouncement(announcement, lang)
}

/** Caller: repeat spoken announcement while waiting for the other person to answer. */
export function startOutgoingRingback(announcement: string, lang?: string) {
  void startVoiceAnnouncement(announcement, lang)
}

/** Retry the last announcement (e.g. after tab becomes visible on iOS). */
export function retryVoiceCallAnnouncement() {
  if (!lastAnnouncement) return
  void startVoiceAnnouncement(lastAnnouncement, lastLang)
}
