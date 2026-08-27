import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { prisma } from './prisma'

/**
 * One-time codes that carry a completed social sign-in from the system browser back into the
 * native app WebView. Google rejects OAuth inside embedded WebViews (disallowed_useragent), so
 * the native app runs the flow in Chrome Custom Tabs / ASWebAuthenticationSession, where the
 * session cookie lands in the browser's cookie jar rather than the app's.
 */

/** Short enough that a stolen code is useless in practice, long enough for a slow app switch. */
const HANDOFF_TTL_MS = 2 * 60 * 1000

export { NATIVE_HANDOFF_PROVIDER_ID } from './nativeAuthFlow'

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export type NativeHandoffPlatform = 'ios' | 'android' | 'unknown'

export function normalizeHandoffPlatform(value: unknown): NativeHandoffPlatform {
  return value === 'ios' || value === 'android' ? value : 'unknown'
}

export async function createNativeAuthHandoffCode(
  userId: string,
  platform: NativeHandoffPlatform = 'unknown',
): Promise<string> {
  const code = randomBytes(32).toString('base64url')

  // A pending code per user is a login in progress; replace it so only the newest can be redeemed.
  await prisma.nativeAuthHandoff.deleteMany({ where: { userId, consumedAt: null } })

  await prisma.nativeAuthHandoff.create({
    data: {
      userId,
      codeHash: hashCode(code),
      platform,
      expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
    },
  })

  // Opportunistic cleanup; the table would otherwise only ever grow.
  await prisma.nativeAuthHandoff
    .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - HANDOFF_TTL_MS) } } })
    .catch(() => undefined)

  return code
}

/**
 * Redeem a code exactly once. Returns the user id, or null when the code is unknown, expired,
 * or already used. The delete is the atomic guard — two racing redemptions cannot both win.
 */
export async function consumeNativeAuthHandoffCode(code: string): Promise<string | null> {
  const trimmed = (code || '').trim()
  if (!trimmed) return null

  const codeHash = hashCode(trimmed)
  const record = await prisma.nativeAuthHandoff.findUnique({ where: { codeHash } })
  if (!record) return null

  // Constant-time compare so lookup timing cannot be used to probe for valid hashes.
  const matches = timingSafeEqual(Buffer.from(record.codeHash), Buffer.from(codeHash))

  const { count } = await prisma.nativeAuthHandoff.deleteMany({
    where: { id: record.id, consumedAt: null },
  })
  if (count !== 1 || !matches) return null
  if (record.expiresAt.getTime() < Date.now()) return null

  return record.userId
}
