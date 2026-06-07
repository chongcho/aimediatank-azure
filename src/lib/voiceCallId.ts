/** Voice call IDs are UUIDs; iOS CallKit emits uppercase while the DB stores lowercase. */
export function normalizeVoiceCallId(callId: string | null | undefined): string {
  return (callId || '').trim().toLowerCase()
}

export function voiceCallIdsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false
  return normalizeVoiceCallId(a) === normalizeVoiceCallId(b)
}
