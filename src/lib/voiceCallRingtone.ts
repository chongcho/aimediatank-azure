/**
 * Voice-call ring while unanswered.
 *
 * Speaks "Call from {name}" (incoming) or "Calling {name}" (outgoing) via
 * Azure TTS when configured, else browser speechSynthesis, else WAV fallback.
 *
 * iOS native incoming on lock screen: CallKit ring + caller name (system UI).
 * In-app / web / outgoing uses spoken announcements when possible.
 */

export const VOICE_CALL_RING_TIMEOUT_MS = 60000
const IOS_GESTURE_WINDOW_MS = 2500
const ANNOUNCEMENT_LOOP_GAP_MS = 900

const RING_URLS = {
  incoming: '/sounds/incoming-ring.wav',
  outgoing: '/sounds/outgoing-ring.wav',
} as const

type RingKind = keyof typeof RING_URLS

let audioContext: AudioContext | null = null
let unlockListenersInstalled = false
let loopGeneration = 0
let lastUserGestureAt = 0
let activeRingKind: RingKind | null = null
let pendingRingStart: (() => void) | null = null
let openedFromCallNotification = false
let ringActiveSource: AudioBufferSourceNode | null = null
let speechLoopTimer: ReturnType<typeof setTimeout> | null = null
let usingSpeechSynthesis = false
const ringBufferCache = new Map<string, AudioBuffer>()

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

function hasRecentUserGesture(): boolean {
  return Date.now() - lastUserGestureAt < IOS_GESTURE_WINDOW_MS
}

function normalizeSpeechLang(lang?: string): string | undefined {
  if (!lang) return undefined
  if (lang.includes('-')) return lang
  const map: Record<string, string> = {
    en: 'en-US',
    ko: 'ko-KR',
    ja: 'ja-JP',
    zh: 'zh-CN',
    es: 'es-ES',
    fr: 'fr-FR',
    de: 'de-DE',
    pt: 'pt-BR',
    it: 'it-IT',
  }
  return map[lang.toLowerCase()] || lang
}

function stopRingPlayback() {
  if (!ringActiveSource) return
  try {
    ringActiveSource.onended = null
    ringActiveSource.stop()
  } catch {
    // already stopped
  }
  try {
    ringActiveSource.disconnect()
  } catch {
    // ignore
  }
  ringActiveSource = null
}

function stopSpeechSynthesis() {
  if (speechLoopTimer) {
    clearTimeout(speechLoopTimer)
    speechLoopTimer = null
  }
  usingSpeechSynthesis = false
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
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

function stopPlayback() {
  loopGeneration += 1
  stopRingPlayback()
  stopSpeechSynthesis()
  clearMediaSession()
}

async function getRingBuffer(url: string): Promise<AudioBuffer | null> {
  if (typeof fetch === 'undefined') return null
  const ctx = getAudioContext()
  if (!ctx) return null

  const cached = ringBufferCache.get(url)
  if (cached) return cached

  try {
    const res = await fetch(url, { cache: 'force-cache' })
    if (!res.ok) return null
    const arrayBuffer = await res.arrayBuffer()
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
    ringBufferCache.set(url, buffer)
    return buffer
  } catch {
    return null
  }
}

async function fetchTtsBuffer(text: string, lang?: string): Promise<AudioBuffer | null> {
  if (typeof fetch === 'undefined') return null
  const ctx = getAudioContext()
  if (!ctx) return null

  const cacheKey = `tts:${lang || 'en'}:${text}`
  const cached = ringBufferCache.get(cacheKey)
  if (cached) return cached

  try {
    const params = new URLSearchParams({ text, lang: lang || 'en' })
    const res = await fetch(`/api/chat/voice/tts?${params}`, { credentials: 'include' })
    if (!res.ok) return null
    const arrayBuffer = await res.arrayBuffer()
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
    ringBufferCache.set(cacheKey, buffer)
    return buffer
  } catch {
    return null
  }
}

function playRingLoop(buffer: AudioBuffer, generation: number) {
  const ctx = getAudioContext()
  if (!ctx || generation !== loopGeneration || !activeRingKind) return
  void ctx.resume?.().catch(() => {})

  try {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(ctx.destination)
    source.start()
    ringActiveSource = source
  } catch {
    // ignore transient playback errors
  }
}

function playSpeechLoop(text: string, lang: string | undefined, generation: number): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false

  usingSpeechSynthesis = true
  const speakOnce = () => {
    if (generation !== loopGeneration || !usingSpeechSynthesis || !activeRingKind) return
    const utterance = new SpeechSynthesisUtterance(text)
    const speechLang = normalizeSpeechLang(lang)
    if (speechLang) utterance.lang = speechLang
    utterance.onend = () => {
      if (generation !== loopGeneration || !usingSpeechSynthesis) return
      speechLoopTimer = window.setTimeout(speakOnce, ANNOUNCEMENT_LOOP_GAP_MS)
    }
    window.speechSynthesis.speak(utterance)
  }

  speakOnce()
  return true
}

function flushPendingRing() {
  if (!pendingRingStart) return
  const start = pendingRingStart
  pendingRingStart = null
  start()
}

function maybeFlushPendingRing() {
  if (!pendingRingStart) return
  if (isIosDevice() && !hasRecentUserGesture()) return
  flushPendingRing()
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
  maybeFlushPendingRing()
  return true
}

async function onUserGesture() {
  lastUserGestureAt = Date.now()
  await unlockVoiceCallAudio()
  if (pendingRingStart) {
    flushPendingRing()
    return
  }
  if (
    activeRingKind &&
    isIosDevice() &&
    !ringActiveSource &&
    !usingSpeechSynthesis &&
    pendingRingStart === null
  ) {
    retryVoiceCallRingtone()
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
  if (!wasOpenedFromCallNotification() && !activeRingKind) return
  void unlockVoiceCallAudio()
  maybeFlushPendingRing()
  if (activeRingKind && (!isIosDevice() || hasRecentUserGesture())) {
    void startRing(activeRingKind, lastAnnouncement, lastLang)
    clearOpenedFromCallNotification()
  }
}

export function stopVoiceCallRingtone() {
  stopPlayback()
  pendingRingStart = null
  activeRingKind = null
  lastAnnouncement = undefined
  lastLang = undefined
}

let lastAnnouncement: string | undefined
let lastLang: string | undefined

function isSameRingRunning(kind: RingKind) {
  return activeRingKind === kind && (ringActiveSource !== null || usingSpeechSynthesis || pendingRingStart !== null)
}

async function beginAudioPlayback(
  kind: RingKind,
  generation: number,
  play: () => void,
) {
  pendingRingStart = play

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
    flushPendingRing()
    clearOpenedFromCallNotification()
    return
  }

  if (isIosDevice()) {
    await unlockVoiceCallAudio()
    if (generation !== loopGeneration) return
    maybeFlushPendingRing()
    return
  }

  await unlockVoiceCallAudio()
  flushPendingRing()
}

async function startRing(kind: RingKind, announcement?: string, lang?: string) {
  if (isSameRingRunning(kind) && announcement === lastAnnouncement && lang === lastLang) return

  stopVoiceCallRingtone()
  activeRingKind = kind
  lastAnnouncement = announcement?.trim() || undefined
  lastLang = lang
  const generation = loopGeneration

  const spoken = lastAnnouncement
  if (spoken) {
    const ttsBuffer = await fetchTtsBuffer(spoken, lang)
    if (generation !== loopGeneration) return
    if (ttsBuffer) {
      await beginAudioPlayback(kind, generation, () => playRingLoop(ttsBuffer, generation))
      return
    }
    if (playSpeechLoop(spoken, lang, generation)) {
      await unlockVoiceCallAudio()
      return
    }
  }

  const buffer = await getRingBuffer(RING_URLS[kind])
  if (generation !== loopGeneration) return

  if (!buffer) {
    console.warn(`Voice call ring failed to load: ${RING_URLS[kind]}`)
    activeRingKind = null
    return
  }

  await beginAudioPlayback(kind, generation, () => playRingLoop(buffer, generation))
}

export function startIncomingRingtone(announcement?: string, lang?: string) {
  void startRing('incoming', announcement, lang)
}

export function startOutgoingRingback(announcement?: string, lang?: string) {
  void startRing('outgoing', announcement, lang)
}

export function retryVoiceCallRingtone() {
  if (!activeRingKind) return

  if (isIosDevice() && ringActiveSource && !hasRecentUserGesture()) return

  const kind = activeRingKind
  const announcement = lastAnnouncement
  const lang = lastLang
  stopVoiceCallRingtone()
  void startRing(kind, announcement, lang)
}

/** @deprecated Use retryVoiceCallRingtone */
export function retryVoiceCallAnnouncement() {
  retryVoiceCallRingtone()
}
