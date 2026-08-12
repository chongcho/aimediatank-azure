import { createHash, timingSafeEqual } from 'crypto'
import { compare, hash } from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Second step after admin credentials (or OAuth) sign-in: passphrase distinct from
 * the account login password and from ADMIN_PANEL_ACCESS_PASSWORD_*.
 *
 * Resolution order for verify:
 * 1. DB override hash in MediaDetailSetting.shareAppsEnabled.__auth.adminUserStep2PasswordHash
 *    (set from Admin → Authentication)
 * 2. ADMIN_USER_STEP2_PASSWORD_HASH (bcrypt env)
 * 3. ADMIN_USER_STEP2_PASSWORD (plain env, local/dev only)
 */

const AUTH_HASH_KEY = 'adminUserStep2PasswordHash'
const MIN_PASSWORD_LENGTH = 8

type AuthBlob = Record<string, unknown>

function readAuthBlob(raw: unknown): AuthBlob {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const auth = (raw as Record<string, unknown>).__auth
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return {}
  return auth as AuthBlob
}

async function getDbAdminUserStep2PasswordHash(): Promise<string | null> {
  try {
    const row = await prisma.mediaDetailSetting.findFirst({
      select: { shareAppsEnabled: true },
    })
    const auth = readAuthBlob(row?.shareAppsEnabled)
    const h = auth[AUTH_HASH_KEY]
    return typeof h === 'string' && h.trim() ? h.trim() : null
  } catch {
    return null
  }
}

function isEnvAdminUserStep2PasswordConfigured(): boolean {
  const h = process.env.ADMIN_USER_STEP2_PASSWORD_HASH?.trim()
  const p = process.env.ADMIN_USER_STEP2_PASSWORD?.trim()
  return Boolean(h || p)
}

/** True when Step 2 can be verified (DB override and/or server env). */
export async function isAdminUserStep2PasswordConfigured(): Promise<boolean> {
  if (isEnvAdminUserStep2PasswordConfigured()) return true
  return Boolean(await getDbAdminUserStep2PasswordHash())
}

/** Sync env-only check (pages that cannot await DB yet). Prefer the async helper. */
export function isAdminUserStep2PasswordConfiguredFromEnv(): boolean {
  return isEnvAdminUserStep2PasswordConfigured()
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
  if (!input) return false

  const dbHash = await getDbAdminUserStep2PasswordHash()
  if (dbHash) {
    try {
      return await compare(input, dbHash)
    } catch {
      return false
    }
  }

  const hashEnv = process.env.ADMIN_USER_STEP2_PASSWORD_HASH?.trim()
  if (hashEnv) {
    try {
      return await compare(input, hashEnv)
    } catch {
      return false
    }
  }

  const plainEnv = process.env.ADMIN_USER_STEP2_PASSWORD?.trim()
  if (plainEnv) {
    return timingSafeSha256Equal(plainEnv, input)
  }

  return false
}

export type SetAdminUserStep2PasswordResult =
  | { ok: true; source: 'database' }
  | { ok: false; error: string }

/**
 * Change the Step 2 passphrase. Stores a bcrypt hash in DB (overrides env until cleared).
 * Requires current password when any Step 2 secret is already configured.
 */
export async function setAdminUserStep2Password(params: {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}): Promise<SetAdminUserStep2PasswordResult> {
  const currentPassword = typeof params.currentPassword === 'string' ? params.currentPassword : ''
  const newPassword = typeof params.newPassword === 'string' ? params.newPassword : ''
  const confirmPassword = typeof params.confirmPassword === 'string' ? params.confirmPassword : ''

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` }
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'New password and confirmation do not match' }
  }

  const configured = await isAdminUserStep2PasswordConfigured()
  if (configured) {
    const currentOk = await verifyAdminUserStep2Password(currentPassword)
    if (!currentOk) {
      return { ok: false, error: 'Current Step 2 password is incorrect' }
    }
  }

  const passwordHash = await hash(newPassword, 12)

  let row = await prisma.mediaDetailSetting.findFirst()
  if (!row) {
    row = await prisma.mediaDetailSetting.create({ data: {} })
  }

  const raw =
    row.shareAppsEnabled &&
    typeof row.shareAppsEnabled === 'object' &&
    !Array.isArray(row.shareAppsEnabled)
      ? ({ ...(row.shareAppsEnabled as Record<string, unknown>) } as Record<string, unknown>)
      : {}
  const prevAuth = readAuthBlob(raw)
  const nextAuth: AuthBlob = {
    ...prevAuth,
    [AUTH_HASH_KEY]: passwordHash,
  }

  await prisma.mediaDetailSetting.update({
    where: { id: row.id },
    data: {
      shareAppsEnabled: {
        ...raw,
        __auth: nextAuth,
      } as Prisma.InputJsonValue,
    },
  })

  return { ok: true, source: 'database' }
}

/** Remove DB override so verification falls back to server env. Requires current password. */
export async function clearAdminUserStep2PasswordDbOverride(
  currentPassword: string
): Promise<SetAdminUserStep2PasswordResult> {
  const dbHash = await getDbAdminUserStep2PasswordHash()
  if (!dbHash) {
    return { ok: false, error: 'No database Step 2 password override is set' }
  }
  if (!(await verifyAdminUserStep2Password(currentPassword))) {
    return { ok: false, error: 'Current Step 2 password is incorrect' }
  }
  if (!isEnvAdminUserStep2PasswordConfigured()) {
    return {
      ok: false,
      error: 'Cannot clear database override while no ADMIN_USER_STEP2_PASSWORD_* is set on the server',
    }
  }

  let row = await prisma.mediaDetailSetting.findFirst()
  if (!row) {
    return { ok: false, error: 'Settings row not found' }
  }
  const raw =
    row.shareAppsEnabled &&
    typeof row.shareAppsEnabled === 'object' &&
    !Array.isArray(row.shareAppsEnabled)
      ? ({ ...(row.shareAppsEnabled as Record<string, unknown>) } as Record<string, unknown>)
      : {}
  const prevAuth = { ...readAuthBlob(raw) }
  delete prevAuth[AUTH_HASH_KEY]

  await prisma.mediaDetailSetting.update({
    where: { id: row.id },
    data: {
      shareAppsEnabled: {
        ...raw,
        __auth: prevAuth,
      } as Prisma.InputJsonValue,
    },
  })

  return { ok: true, source: 'database' }
}

export async function getAdminUserStep2PasswordStatus(): Promise<{
  configured: boolean
  source: 'database' | 'environment' | 'none'
  envConfigured: boolean
  databaseOverride: boolean
}> {
  const databaseOverride = Boolean(await getDbAdminUserStep2PasswordHash())
  const envConfigured = isEnvAdminUserStep2PasswordConfigured()
  if (databaseOverride) {
    return { configured: true, source: 'database', envConfigured, databaseOverride: true }
  }
  if (envConfigured) {
    return { configured: true, source: 'environment', envConfigured: true, databaseOverride: false }
  }
  return { configured: false, source: 'none', envConfigured: false, databaseOverride: false }
}
