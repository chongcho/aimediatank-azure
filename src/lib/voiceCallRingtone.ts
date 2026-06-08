/**
 * KakaoTalk-style ring audio for TalkChat voice calls while unanswered.
 *
 * Incoming: double-ring cadence (/sounds/incoming-ring.wav)
 * Outgoing: ringback beep (/sounds/outgoing-ring.wav)
 *
 * Caller name is shown in the call overlay only (no TTS).
 * iOS requires an in-page tap to unlock Web Audio; notification taps do not count.
 * On the native iOS app, in-app ringtone plays until the user taps Decline or Accept.
 */

export const VOICE_CALL_RING_TIMEOUT_MS = 60000
const IOS_GESTURE_WINDOW_MS = 2500

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
    void startRing(activeRingKind)
    clearOpenedFromCallNotification()
  }
}

export function stopVoiceCallRingtone() {
  stopPlayback()
  pendingRingStart = null
  activeRingKind = null
}

function isSameRingRunning(kind: RingKind) {
  return activeRingKind === kind && (ringActiveSource !== null || pendingRingStart !== null)
}

async function startRing(kind: RingKind) {
  if (isSameRingRunning(kind)) return

  stopVoiceCallRingtone()
  activeRingKind = kind
  const generation = loopGeneration

  const buffer = await getRingBuffer(RING_URLS[kind])
  if (generation !== loopGeneration) return

  if (!buffer) {
    console.warn(`Voice call ring failed to load: ${RING_URLS[kind]}`)
    activeRingKind = null
    return
  }

  pendingRingStart = () => playRingLoop(buffer, generation)

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

export function startIncomingRingtone(_announcement?: string, _lang?: string) {
  void startRing('incoming')
}

export function startOutgoingRingback(_announcement?: string, _lang?: string) {
  void startRing('outgoing')
}

export function retryVoiceCallRingtone() {
  if (!activeRingKind) return

  if (isIosDevice() && ringActiveSource && !hasRecentUserGesture()) return

  const kind = activeRingKind
  stopVoiceCallRingtone()
  void startRing(kind)
}

/** @deprecated Use retryVoiceCallRingtone */
export function retryVoiceCallAnnouncement() {
  retryVoiceCallRingtone()
}
