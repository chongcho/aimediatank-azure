import { createHash, timingSafeEqual } from 'crypto'
import { compare } from 'bcryptjs'

/**
 * Optional second factor for /admin re-auth: a passphrase stored only in server env,
 * distinct from the user's account (login) password.
 *
 * Prefer ADMIN_PANEL_ACCESS_PASSWORD_HASH (bcrypt). Plain ADMIN_PANEL_ACCESS_PASSWORD
 * is supported for local/dev; use hash in production.
 */
export function isAdminPanelAccessPasswordConfigured(): boolean {
  const h = process.env.ADMIN_PANEL_ACCESS_PASSWORD_HASH?.trim()
  const p = process.env.ADMIN_PANEL_ACCESS_PASSWORD?.trim()
  return Boolean(h || p)
}

/** When true, Step 2 is blocked until ADMIN_PANEL_ACCESS_PASSWORD_HASH (or legacy plain env) is set. */
export function isDedicatedAdminPanelPasswordRequired(): boolean {
  return process.env.ADMIN_REQUIRE_DEDICATED_PANEL_PASSWORD === 'true'
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

export async function verifyAdminPanelAccessPassword(plain: string): Promise<boolean> {
  const input = typeof plain === 'string' ? plain : ''
  const hashEnv = process.env.ADMIN_PANEL_ACCESS_PASSWORD_HASH?.trim()
  if (hashEnv) {
    if (!input) return false
    try {
      return await compare(input, hashEnv)
    } catch {
      return false
    }
  }
  const plainEnv = process.env.ADMIN_PANEL_ACCESS_PASSWORD?.trim()
  if (plainEnv) {
    if (!input) return false
    return timingSafeSha256Equal(plainEnv, input)
  }
  return false
}
