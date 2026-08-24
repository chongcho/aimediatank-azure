'use client'

import { RING_ASSET_VERSION } from '@/lib/ringAssetVersion'

/** Short message alert — respects in-app Notifications ON preference. */
let audioCtx: AudioContext | null = null
let notificationAudio: HTMLAudioElement | null = null
let audioUnlocked = false

const MESSAGE_SOUND_URL = `/sounds/message-notification.wav?v=${RING_ASSET_VERSION}`

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

function getNotificationAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null
  if (!notificationAudio) {
    notificationAudio = new Audio(MESSAGE_SOUND_URL)
    notificationAudio.preload = 'auto'
  }
  return notificationAudio
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new Ctx()
  }
  return audioCtx
}

function playWebAudioFallback(): void {
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

/** Unlock audio on first user gesture (required on iOS / mobile WebViews). */
export function unlockNotificationAudio(): void {
  const ctx = getAudioContext()
  if (ctx?.state === 'suspended') {
    void ctx.resume().catch(() => {})
  }

  const audio = getNotificationAudio()
  if (!audio || audioUnlocked) return
  audio.volume = 0.001
  void audio
    .play()
    .then(() => {
      audio.pause()
      audio.currentTime = 0
      audio.volume = 1
      audioUnlocked = true
    })
    .catch(() => {})
}

export function playNotificationSound(): void {
  if (!notificationsEnabled()) return

  const audio = getNotificationAudio()
  if (audio) {
    audio.currentTime = 0
    void audio.play().catch(() => playWebAudioFallback())
    return
  }
  playWebAudioFallback()
}
