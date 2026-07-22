/**
 * Voice-call ring while unanswered.
 *
 * Speaks "Call from {name}" (incoming / callee) or "Calling {name}" (outgoing / caller)
 * via Azure TTS when configured, else browser speechSynthesis, else WAV fallback.
 *
 * iOS native incoming on lock screen: CallKit ring + caller name (system UI).
 * Android native: system TextToSpeech announcement; classic WAV only if TTS fails.
 */

import { getNativePlatform } from '@/lib/nativeShellBoot'
import { isNativeAndroidCallApp, startNativeCallRing, startNativeCallRingAnnouncement, stopNativeCallRing, setNativeCallRingVolume } from '@/lib/nativeCallBridge'
import { RING_ASSET_VERSION } from '@/lib/ringAssetVersion'
import {
  getVoiceCallRingVolume,
  getVoiceCallRingtoneId,
  setVoiceCallRingVolume as persistRingVolume,
} from '@/lib/voiceCallVolume'

export const VOICE_CALL_RING_TIMEOUT_MS = 60000
const IOS_GESTURE_WINDOW_MS = 2500
const ANNOUNCEMENT_LOOP_GAP_MS = 900

function ringUrl(path: string): string {
  return `${path}?v=${RING_ASSET_VERSION}`
}

const RING_URLS = {
  incoming: ringUrl('/sounds/incoming-ring.wav'),
  outgoing: ringUrl('/sounds/outgoing-ring.wav'),
} as const

type RingKind = keyof typeof RING_URLS

let nativeRingActive = false

function useNativeAndroidRing(): boolean {
  return isNativeAndroidCallApp()
}

function absoluteRingUrl(path: string): string {
  if (typeof window === 'undefined') return path
  try {
    return new URL(path, window.location.origin).href
  } catch {
    return path
  }
}

/** Web Audio gain — fallback when native ring is unavailable. */
const RING_GAIN: Record<RingKind, { nativeMobile: number; mobile: number; desktop: number }> = {
  incoming: { nativeMobile: 6, mobile: 2.75, desktop: 1.75 },
  outgoing: { nativeMobile: 5, mobile: 2.25, desktop: 1.5 },
}

let audioContext: AudioContext | null = null
let unlockListenersInstalled = false
let loopGeneration = 0
let lastUserGestureAt = 0
let activeRingKind: RingKind | null = null
let pendingRingStart: (() => void) | null = null
let openedFromCallNotification = false
let ringActiveSource: AudioBufferSourceNode | null = null
let ringActiveGainNode: GainNode | null = null
let speechLoopTimer: ReturnType<typeof globalThis.setTimeout> | null = null
let usingSpeechSynthesis = false
let lastAnnouncement: string | undefined
let lastLang: string | undefined
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

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function ringGainFor(kind: RingKind): number {
  const table = RING_GAIN[kind]
  const platform = getNativePlatform()
  let base = table.desktop
  if (platform === 'ios' || platform === 'android') base = table.nativeMobile
  else if (isMobileDevice()) base = table.mobile
  return base * getVoiceCallRingVolume()
}

export function setVoiceCallRingVolume(level: number) {
  const v = persistRingVolume(level)
  if (ringActiveGainNode) {
    try {
      ringActiveGainNode.gain.value = activeRingKind ? ringGainFor(activeRingKind) : v
    } catch {
      // ignore
    }
  }
  if (nativeRingActive) {
    void setNativeCallRingVolume(v)
  }
}

function resolveRingKind(kind: RingKind): RingKind {
  if (kind === 'incoming') {
    return getVoiceCallRingtoneId()
  }
  return kind
}

function stopRingPlayback() {
  if (ringActiveGainNode) {
    try {
      ringActiveGainNode.disconnect()
    } catch {
      // ignore
    }
    ringActiveGainNode = null
  }
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

function stopPlayback() {
  loopGeneration += 1
  stopRingPlayback()
  stopSpeechSynthesis()
  clearMediaSession()
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

async function getRingBuffer(url: string): Promise<AudioBuffer | null> {
  if (typeof fetch === 'undefined') return null
  const ctx = getAudioContext()
  if (!ctx) return null

  const cached = ringBufferCache.get(url)
  if (cached) return cached

  try {
    const res = await fetch(url, { cache: 'no-store' })
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

function playRingLoop(buffer: AudioBuffer, generation: number, seamless = true) {
  const ctx = getAudioContext()
  if (!ctx || generation !== loopGeneration || !activeRingKind) return
  void ctx.resume?.().catch(() => {})

  const playOnce = () => {
    if (generation !== loopGeneration || !activeRingKind) return
    try {
      stopRingPlayback()
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = seamless
      const gainNode = ctx.createGain()
      gainNode.gain.value = ringGainFor(activeRingKind)
      source.connect(gainNode)
      gainNode.connect(ctx.destination)
      if (!seamless) {
        source.onended = () => {
          if (generation !== loopGeneration) return
          speechLoopTimer = globalThis.setTimeout(playOnce, ANNOUNCEMENT_LOOP_GAP_MS)
        }
      }
      source.start()
      ringActiveSource = source
      ringActiveGainNode = gainNode
    } catch {
      // ignore transient playback errors
    }
  }

  playOnce()
}

function playSpeechLoop(text: string, lang: string | undefined, generation: number): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false

  usingSpeechSynthesis = true
  const SPEECH_STALL_MS = 8000

  const abandonSpeechAndFallback = () => {
    if (generation !== loopGeneration) return
    // Clear speech state without bumping loopGeneration so WAV can start for this ring.
    if (speechLoopTimer) {
      clearTimeout(speechLoopTimer)
      speechLoopTimer = null
    }
    usingSpeechSynthesis = false
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignore
    }
    void fallbackRingToWav(generation)
  }

  const speakOnce = () => {
    if (generation !== loopGeneration || !usingSpeechSynthesis || !activeRingKind) return
    const utterance = new SpeechSynthesisUtterance(text)
    const speechLang = normalizeSpeechLang(lang)
    if (speechLang) utterance.lang = speechLang

    let settled = false
    const stallTimer = globalThis.setTimeout(() => {
      if (settled || generation !== loopGeneration) return
      // iOS often fails silently (no onend/onerror) when speech is blocked.
      markSettled()
      abandonSpeechAndFallback()
    }, SPEECH_STALL_MS)

    const markSettled = () => {
      if (settled) return
      settled = true
      clearTimeout(stallTimer)
    }

    utterance.onend = () => {
      markSettled()
      if (generation !== loopGeneration || !usingSpeechSynthesis) return
      speechLoopTimer = globalThis.setTimeout(speakOnce, ANNOUNCEMENT_LOOP_GAP_MS)
    }
    // Spec: error and end are mutually exclusive — without onerror the loop stalls forever.
    utterance.onerror = () => {
      markSettled()
      abandonSpeechAndFallback()
    }
    window.speechSynthesis.speak(utterance)
  }

  speakOnce()
  return true
}

/** When speech synthesis fails or stalls, keep ringing with classic WAV. */
async function fallbackRingToWav(generation: number) {
  if (generation !== loopGeneration || !activeRingKind) return
  const kind = activeRingKind
  const playbackKind = resolveRingKind(kind)

  if (useNativeAndroidRing()) {
    nativeRingActive = true
    try {
      await startNativeCallRing(absoluteRingUrl(RING_URLS[playbackKind]), {
        incoming: kind === 'incoming',
      })
      void setNativeCallRingVolume(getVoiceCallRingVolume())
      return
    } catch {
      nativeRingActive = false
      void stopNativeCallRing()
    }
  }

  const buffer = await getRingBuffer(RING_URLS[playbackKind])
  if (generation !== loopGeneration || !activeRingKind) return
  if (!buffer) {
    console.warn(`Voice call ring WAV fallback failed: ${RING_URLS[kind]}`)
    return
  }
  await beginAudioPlayback(kind, generation, () => playRingLoop(buffer, generation, true))
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

/** Call from voice-call buttons so iOS Web Audio can play outgoing ringback. */
export function markVoiceCallUserGesture() {
  lastUserGestureAt = Date.now()
  void unlockVoiceCallAudio()
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
  // Allow gesture retry even when speech was "active" but silent/stalled
  // (usingSpeechSynthesis true with no Web Audio source).
  if (activeRingKind && isIosDevice() && !ringActiveSource && pendingRingStart === null) {
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
  if (nativeRingActive) {
    nativeRingActive = false
    void stopNativeCallRing()
  }
  stopPlayback()
  pendingRingStart = null
  activeRingKind = null
  lastAnnouncement = undefined
  lastLang = undefined
}

/** Close lock-screen / SW voice-call notifications so stale pushes cannot re-alert. */
export async function dismissVoiceCallPushNotifications(callId: string) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const notifications = await reg.getNotifications()
    const normalized = callId.trim().toLowerCase()
    for (const notification of notifications) {
      const data = (notification.data || {}) as { type?: string; callId?: string }
      if (
        data.type === 'voice_call' &&
        (data.callId || '').trim().toLowerCase() === normalized
      ) {
        notification.close()
      }
    }
  } catch {
    // ignore
  }
}

function isSameRingRunning(kind: RingKind) {
  return (
    activeRingKind === kind &&
    (nativeRingActive ||
      ringActiveSource !== null ||
      usingSpeechSynthesis ||
      pendingRingStart !== null)
  )
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
  const spoken = announcement?.trim() || undefined
  if (
    isSameRingRunning(kind) &&
    spoken === lastAnnouncement &&
    lang === lastLang
  ) {
    return
  }

  stopVoiceCallRingtone()
  activeRingKind = kind
  lastAnnouncement = spoken
  lastLang = lang
  const generation = loopGeneration

  // Prefer spoken "Call from {name}" / "Calling {name}" when provided.
  if (spoken) {
    // Android native: system TextToSpeech — reliable without WebView speechSynthesis / Azure.
    if (useNativeAndroidRing()) {
      nativeRingActive = true
      try {
        await startNativeCallRingAnnouncement(spoken, lang)
        void setNativeCallRingVolume(getVoiceCallRingVolume())
        return
      } catch {
        nativeRingActive = false
        void stopNativeCallRing()
      }
    }

    const ttsBuffer = await fetchTtsBuffer(spoken, lang)
    if (generation !== loopGeneration) return
    if (ttsBuffer) {
      await beginAudioPlayback(kind, generation, () => playRingLoop(ttsBuffer, generation, false))
      return
    }
    if (playSpeechLoop(spoken, lang, generation)) {
      await unlockVoiceCallAudio()
      return
    }
  }

  const playbackKind = resolveRingKind(kind)

  if (useNativeAndroidRing()) {
    nativeRingActive = true
    try {
      await startNativeCallRing(absoluteRingUrl(RING_URLS[playbackKind]), {
        incoming: kind === 'incoming',
      })
      void setNativeCallRingVolume(getVoiceCallRingVolume())
      return
    } catch {
      nativeRingActive = false
      void stopNativeCallRing()
    }
  }

  const buffer = await getRingBuffer(RING_URLS[playbackKind])
  if (generation !== loopGeneration) return

  if (!buffer) {
    console.warn(`Voice call ring failed to load: ${RING_URLS[kind]}`)
    activeRingKind = null
    return
  }

  await beginAudioPlayback(kind, generation, () => playRingLoop(buffer, generation, true))
}

export function startIncomingRingtone(announcement?: string, lang?: string) {
  void startRing('incoming', announcement, lang)
}

export function startOutgoingRingback(announcement?: string, lang?: string) {
  void startRing('outgoing', announcement, lang)
}

export function retryVoiceCallRingtone() {
  if (!activeRingKind) return

  if (isIosDevice() && (ringActiveSource || usingSpeechSynthesis) && !hasRecentUserGesture()) return

  const kind = activeRingKind
  const announcement = lastAnnouncement
  const lang = lastLang
  stopVoiceCallRingtone()
  void startRing(kind, announcement, lang)
}

/** Apply a new incoming ringtone preference and replay if ringing. */
export function applyVoiceCallRingtonePreference() {
  if (!activeRingKind) return
  retryVoiceCallRingtone()
}

/** @deprecated Use retryVoiceCallRingtone */
export function retryVoiceCallAnnouncement() {
  retryVoiceCallRingtone()
}
