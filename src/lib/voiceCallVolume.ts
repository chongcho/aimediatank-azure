const RING_VOLUME_KEY = 'voiceCallRingVolume'
const VOICE_VOLUME_KEY = 'voiceCallVoiceVolume'
const RINGTONE_KEY = 'voiceCallRingtone'

export type VoiceCallRingtoneId = 'incoming' | 'outgoing'

const DEFAULT_RING_VOLUME = 1
const DEFAULT_VOICE_VOLUME = 1

/** App-side incoming ring boost. Does not change OS call or ringer volume. */
export const INCOMING_RING_APP_GAIN = 1.75

function readStored(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const n = Number(raw)
    if (!Number.isFinite(n)) return fallback
    return Math.max(0, Math.min(1, n))
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: number) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, String(Math.max(0, Math.min(1, value))))
  } catch {
    // ignore quota / private mode
  }
}

export function getVoiceCallRingVolume(): number {
  return readStored(RING_VOLUME_KEY, DEFAULT_RING_VOLUME)
}

export function setVoiceCallRingVolume(value: number): number {
  const level = Math.max(0, Math.min(1, value))
  writeStored(RING_VOLUME_KEY, level)
  return level
}

export function getVoiceCallVoiceVolume(): number {
  return readStored(VOICE_VOLUME_KEY, DEFAULT_VOICE_VOLUME)
}

export function setVoiceCallVoiceVolume(value: number): number {
  const level = Math.max(0, Math.min(1, value))
  writeStored(VOICE_VOLUME_KEY, level)
  return level
}

export function getVoiceCallRingtoneId(): VoiceCallRingtoneId {
  if (typeof window === 'undefined') return 'incoming'
  try {
    const raw = localStorage.getItem(RINGTONE_KEY)
    return raw === 'outgoing' ? 'outgoing' : 'incoming'
  } catch {
    return 'incoming'
  }
}

export function setVoiceCallRingtoneId(id: VoiceCallRingtoneId): VoiceCallRingtoneId {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(RINGTONE_KEY, id)
    } catch {
      // ignore
    }
  }
  return id
}

export function formatVolumePercent(level: number): string {
  return `${Math.round(Math.max(0, Math.min(1, level)) * 100)}%`
}
