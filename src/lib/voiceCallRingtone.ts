/**
 * Browser-generated ring tones for TalkChat voice calls (no audio files).
 * Incoming: short double-ring pattern. Outgoing: ringback (long tone, pause).
 *
 * iOS Safari/PWA keeps AudioContext suspended until a user gesture — use
 * installVoiceCallAudioUnlock() at app startup and retry when a call rings.
 */

/** Tiny silent WAV — primes iOS HTML audio output on first user tap. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

let audioContext: AudioContext | null = null
let loopTimer: ReturnType<typeof setTimeout> | null = null
let activeOscillators: OscillatorNode[] = []
let unlockListenersInstalled = false
let pendingRing: (() => void) | null = null

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

function clearLoopTimer() {
  if (loopTimer !== null) {
    clearTimeout(loopTimer)
    loopTimer = null
  }
}

function stopActiveOscillators() {
  for (const osc of activeOscillators) {
    try {
      osc.stop()
    } catch {
      // already stopped
    }
  }
  activeOscillators = []
}

function flushPendingRing() {
  const ctx = getAudioContext()
  if (!ctx || ctx.state !== 'running' || !pendingRing) return
  const start = pendingRing
  pendingRing = null
  start()
}

function isAudioContextRunning(ctx: AudioContext): boolean {
  return ctx.state === 'running'
}

/** Resume Web Audio after a user gesture (required on iOS). */
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
  flushPendingRing()
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
  }

  document.addEventListener('touchstart', onGesture, { passive: true, capture: true })
  document.addEventListener('pointerdown', onGesture, { passive: true, capture: true })
  document.addEventListener('click', onGesture, { capture: true })
  document.addEventListener('keydown', onGesture, { capture: true })
}

/** Stop any playing ring or ringback tone. */
export function stopVoiceCallRingtone() {
  clearLoopTimer()
  stopActiveOscillators()
  pendingRing = null
}

function playDualTone(durationMs: number, volume = 0.12) {
  const ctx = getAudioContext()
  if (!ctx || ctx.state !== 'running') return

  const gain = ctx.createGain()
  const now = ctx.currentTime
  const end = now + durationMs / 1000
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(volume, now + 0.02)
  gain.gain.setValueAtTime(volume, end - 0.04)
  gain.gain.linearRampToValueAtTime(0, end)
  gain.connect(ctx.destination)

  const oscs: OscillatorNode[] = []
  for (const freq of [440, 480]) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    osc.connect(gain)
    osc.start(now)
    osc.stop(end)
    oscs.push(osc)
  }
  activeOscillators.push(...oscs)
  window.setTimeout(() => {
    activeOscillators = activeOscillators.filter((o) => !oscs.includes(o))
  }, durationMs + 100)
}

function runPattern(steps: ReadonlyArray<{ toneMs: number; pauseMs: number }>) {
  clearLoopTimer()
  stopActiveOscillators()

  let index = 0

  const runStep = () => {
    const step = steps[index]
    if (!step) return

    playDualTone(step.toneMs)
    index = (index + 1) % steps.length

    loopTimer = setTimeout(runStep, step.toneMs + step.pauseMs)
  }

  runStep()
}

async function startRingPattern(steps: ReadonlyArray<{ toneMs: number; pauseMs: number }>) {
  stopVoiceCallRingtone()

  const start = () => runPattern(steps)
  const unlocked = await unlockVoiceCallAudio()
  const ctx = getAudioContext()
  if (unlocked && ctx?.state === 'running') {
    start()
    return
  }

  pendingRing = start
}

/** Callee: repeating double-ring while incoming call is unanswered. */
export function startIncomingRingtone() {
  void startRingPattern([
    { toneMs: 400, pauseMs: 200 },
    { toneMs: 400, pauseMs: 2000 },
  ])
}

/** Caller: ringback while waiting for the other person to answer. */
export function startOutgoingRingback() {
  void startRingPattern([{ toneMs: 2000, pauseMs: 4000 }])
}
