/**
 * Ring audio for TalkChat voice calls while unanswered.
 *
 * Spoken announcements — server TTS (Azure Speech) on desktop via Web Audio;
 * iOS uses speechSynthesis only so lock-screen Now Playing is not shown.
 * iOS requires an in-page tap to unlock audio; notification taps do not count.
 */

const LOOP_PAUSE_MS = 2000
export const VOICE_CALL_RING_TIMEOUT_MS = 60000
const IOS_GESTURE_WINDOW_MS = 2500

let audioContext: AudioContext | null = null
let unlockListenersInstalled = false
let loopGeneration = 0
let loopScheduleTimer: ReturnType<typeof setTimeout> | null = null
let lastUserGestureAt = 0
let lastAnnouncement: string | null = null
let lastLang: string | undefined
let ringMode: 'speech' | 'tts' = 'speech'
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

function clearMediaSession() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.metadata = null
    navigator.mediaSession.playbackState = 'none'
  } catch {
    // ignore
  }
}

function stopSpeech() {
  loopGeneration += 1
  clearLoopScheduleTimer()
  stopTtsPlayback()
  clearMediaSession()
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

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
      // ignore transient playback errors
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

function maybeFlushPendingAnnouncement() {
  if (!pendingAnnouncementStart) return
  if (isIosDevice() && !hasRecentUserGesture() && ringMode === 'speech') return
  flushPendingAnnouncement()
}

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
  maybeFlushPendingAnnouncement()
  return true
}

async function onUserGesture() {
  lastUserGestureAt = Date.now()
  await unlockVoiceCallAudio()
  if (pendingAnnouncementStart) {
    flushPendingAnnouncement()
    return
  }
  if (
    lastAnnouncement &&
    isIosDevice() &&
    loopScheduleTimer === null &&
    pendingAnnouncementStart === null &&
    !ttsActiveSource
  ) {
    retryVoiceCallAnnouncement()
  }
}

export function installVoiceCallAudioUnlock() {
  if (typeof document === 'undefined' || unlockListenersInstalled) return
  unlockListenersInstalled = true

  document.addEventListener('touchstart', onUserGesture, { passive: true, capture: true })
  document.addEventListener('pointerdown', onUserGesture, { passive: true, capture: true })
  document.addEventListener('click', onUserGesture, { capture: true })
  document.addEventListener('keydown', onUserGesture, { capture: true })
}

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

export function primeVoiceCallAfterNotificationOpen() {
  if (!wasOpenedFromCallNotification() && !lastAnnouncement) return
  void unlockVoiceCallAudio()
  maybeFlushPendingAnnouncement()
  const announcement = lastAnnouncement
  if (announcement && (!isIosDevice() || hasRecentUserGesture())) {
    void startVoiceAnnouncement(announcement, lastLang)
    clearOpenedFromCallNotification()
  }
}

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

  if (isIosDevice()) {
    synth.getVoices()
  }

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
    (loopScheduleTimer !== null || ttsActiveSource !== null || pendingAnnouncementStart !== null)
  )
}

async function startVoiceAnnouncement(announcement: string, lang?: string) {
  if (isSameAnnouncementRunning(announcement, lang)) return

  stopVoiceCallRingtone()
  lastAnnouncement = announcement
  lastLang = lang
  const generation = loopGeneration

  // iOS: use speechSynthesis only — Web Audio TTS shows a lock-screen Now Playing
  // widget (~4s clip) and HTML <audio> priming registers as media playback.
  const buffer = isIosDevice() ? null : await getTtsBuffer(announcement, lang)
  if (generation !== loopGeneration) return

  if (buffer) {
    ringMode = 'tts'
    pendingAnnouncementStart = () => playTtsLoop(buffer, loopGeneration)

    const ctx = getAudioContext()
    if (ctx && !isAudioContextRunning(ctx)) {
      try {
        await ctx.resume()
      } catch {
        // wait for gesture
      }
      if (generation !== loopGeneration) return
    }

    if (ctx && isAudioContextRunning(ctx)) {
      flushPendingAnnouncement()
      clearOpenedFromCallNotification()
      return
    }
  }

  ringMode = 'speech'
  pendingAnnouncementStart = () => runAnnouncementLoop(announcement, lang, loopGeneration)

  if (isIosDevice()) {
    const unlocked = await unlockVoiceCallAudio()
    if (unlocked) {
      flushPendingAnnouncement()
      clearOpenedFromCallNotification()
    }
    return
  }

  await unlockVoiceCallAudio()
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    flushPendingAnnouncement()
  }
}

export function startIncomingRingtone(announcement: string, lang?: string) {
  void startVoiceAnnouncement(announcement, lang)
}

export function startOutgoingRingback(announcement: string, lang?: string) {
  void startVoiceAnnouncement(announcement, lang)
}

export function retryVoiceCallAnnouncement() {
  if (!lastAnnouncement) return

  const loopRunning = loopScheduleTimer !== null || ttsActiveSource !== null
  if (isIosDevice() && loopRunning && ringMode === 'speech' && !hasRecentUserGesture()) return

  const announcement = lastAnnouncement
  const lang = lastLang
  stopVoiceCallRingtone()
  lastAnnouncement = announcement
  lastLang = lang
  void startVoiceAnnouncement(announcement, lang)
}
