'use client'

/** Short message alert — respects in-app Notifications ON preference. */
let audioCtx: AudioContext | null = null

function notificationsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const stored = localStorage.getItem('notifications-on')
    if (stored === 'false') return false
  } catch {
    // ignore
  }
  return true
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new Ctx()
  }
  return audioCtx
}

/** Unlock audio on first user gesture (required on iOS / mobile WebViews). */
export function unlockNotificationAudio(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {})
  }
}

export function playNotificationSound(): void {
  if (!notificationsEnabled()) return

  const ctx = getAudioContext()
  if (!ctx) return

  const run = () => {
    const now = ctx.currentTime
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
    gain.connect(ctx.destination)

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)
      osc.connect(gain)
      osc.start(start)
      osc.stop(start + duration)
    }

    playTone(880, now, 0.12)
    playTone(1174.66, now + 0.13, 0.18)
  }

  if (ctx.state === 'suspended') {
    void ctx.resume().then(run).catch(() => {})
    return
  }
  run()
}
