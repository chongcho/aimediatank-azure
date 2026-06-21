/** Fields loaded for voice-call participants (caller / callee / peer). */
export const VOICE_CALL_USER_SELECT = {
  id: true,
  username: true,
  name: true,
  legalName: true,
  avatar: true,
} as const

export interface VoiceCallParticipant {
  id: string
  username: string
  name: string | null
  legalName: string | null
  avatar: string | null
}

/** Incoming/active call UI: legal name first so CJK and other scripts display correctly. */
export function voiceCallDisplayName(
  user: Pick<VoiceCallParticipant, 'legalName' | 'name' | 'username'> | null | undefined,
  fallback = '',
): string {
  if (!user) return fallback
  return (user.legalName || user.name || user.username || '').trim() || fallback
}
