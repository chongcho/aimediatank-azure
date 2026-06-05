/**
 * Browser-generated ring tones for TalkChat voice calls (no audio files).
 * Incoming: short double-ring pattern. Outgoing: ringback (long tone, pause).
 */

let audioContext: AudioContext | null = null
let loopTimer: ReturnType<typeof setTimeout> | null = null
let activeOscillators: OscillatorNode[] = []

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
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

/** Stop any playing ring or ringback tone. */
export function stopVoiceCallRingtone() {
  clearLoopTimer()
  stopActiveOscillators()
}

function playDualTone(durationMs: number, volume = 0.12) {
  const ctx = getAudioContext()
  void ctx.resume()

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

  void getAudioContext().resume().then(runStep)
}

/** Callee: repeating double-ring while incoming call is unanswered. */
export function startIncomingRingtone() {
  stopVoiceCallRingtone()
  runPattern([
    { toneMs: 400, pauseMs: 200 },
    { toneMs: 400, pauseMs: 2000 },
  ])
}

/** Caller: ringback while waiting for the other person to answer. */
export function startOutgoingRingback() {
  stopVoiceCallRingtone()
  runPattern([{ toneMs: 2000, pauseMs: 4000 }])
}
