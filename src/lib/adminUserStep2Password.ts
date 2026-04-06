import { createHash, timingSafeEqual } from 'crypto'
import { compare } from 'bcryptjs'

/**
 * Second step after admin credentials (or OAuth) sign-in: passphrase in env only,
 * distinct from the account login password and from ADMIN_PANEL_ACCESS_PASSWORD_*.
 *
 * Prefer ADMIN_USER_STEP2_PASSWORD_HASH (bcrypt). Plain ADMIN_USER_STEP2_PASSWORD
 * is for local/dev; use hash in production.
 */
export function isAdminUserStep2PasswordConfigured(): boolean {
  const h = process.env.ADMIN_USER_STEP2_PASSWORD_HASH?.trim()
  const p = process.env.ADMIN_USER_STEP2_PASSWORD?.trim()
  return Boolean(h || p)
}

function timingSafeSha256Equal(a: string, b: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest()
  try {
    const da = digest(a)
    const db = digest(b)
    if (da.length !== db.length) return false
    return timingSafeEqual(da, db)
  } catch {
    return false
  }
}

export async function verifyAdminUserStep2Password(plain: string): Promise<boolean> {
  const input = typeof plain === 'string' ? plain : ''
  const hashEnv = process.env.ADMIN_USER_STEP2_PASSWORD_HASH?.trim()
  if (hashEnv) {
    if (!input) return false
    try {
      return await compare(input, hashEnv)
    } catch {
      return false
    }
  }
  const plainEnv = process.env.ADMIN_USER_STEP2_PASSWORD?.trim()
  if (plainEnv) {
    if (!input) return false
    return timingSafeSha256Equal(plainEnv, input)
  }
  return false
}
