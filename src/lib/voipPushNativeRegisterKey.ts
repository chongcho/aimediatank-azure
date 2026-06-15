import { createHmac, timingSafeEqual } from 'crypto'

function registerSecret(): string | null {
  return process.env.NEXTAUTH_SECRET || process.env.VOICE_DECLINE_SECRET || null
}

/** Issued after session-based voip-subscribe — lets native PushKit re-register without WKWebView. */
export function createNativePushRegisterKey(userId: string): string | null {
  const secret = registerSecret()
  if (!secret || !userId) return null
  return createHmac('sha256', secret).update(`native-push-register:${userId}`).digest('hex')
}

export function verifyNativePushRegisterKey(userId: string, registerKey: string): boolean {
  const expected = createNativePushRegisterKey(userId)
  if (!expected || registerKey.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(registerKey), Buffer.from(expected))
  } catch {
    return false
  }
}
