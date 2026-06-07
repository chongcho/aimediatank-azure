import { createHmac, timingSafeEqual } from 'crypto'

function declineSecret(): string | null {
  return (
    process.env.NEXTAUTH_SECRET ||
    process.env.VOICE_DECLINE_SECRET ||
    process.env.APNS_KEY_ID ||
    null
  )
}

/** Short-lived secret token so CallKit decline can hit the server without a web session. */
export function createVoiceCallDeclineToken(callId: string): string | null {
  const secret = declineSecret()
  if (!secret) return null
  return createHmac('sha256', secret).update(`voice-decline:${callId}`).digest('hex').slice(0, 32)
}

export function verifyVoiceCallDeclineToken(callId: string, token: string): boolean {
  const expected = createVoiceCallDeclineToken(callId)
  if (!expected || token.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    return false
  }
}
