import { createHash, timingSafeEqual } from 'crypto'
import { compare, hash } from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getFirstMediaDetailSetting } from '@/lib/mediaDetailSetting'

/**
 * Admin Panel passphrase (distinct from account login and from Admin Account Step 2).
 *
 * Resolution order for verify:
 * 1. DB override hash in MediaDetailSetting.shareAppsEnabled.__auth.adminPanelAccessPasswordHash
 *    (set from Admin → Authentication)
 * 2. ADMIN_PANEL_ACCESS_PASSWORD_HASH (bcrypt env)
 * 3. ADMIN_PANEL_ACCESS_PASSWORD (plain env, local/dev only)
 */

const AUTH_HASH_KEY = 'adminPanelAccessPasswordHash'
const MIN_PASSWORD_LENGTH = 8

type AuthBlob = Record<string, unknown>

function readAuthBlob(raw: unknown): AuthBlob {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const auth = (raw as Record<string, unknown>).__auth
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return {}
  return auth as AuthBlob
}

/** `unreadable` keeps a DB outage from silently falling back to the env password. */
type DbHashLookup = { readable: true; hash: string | null } | { readable: false; hash: null }

async function lookupDbAdminPanelAccessPasswordHash(): Promise<DbHashLookup> {
  try {
    const row = await getFirstMediaDetailSetting()
    const auth = readAuthBlob(row?.shareAppsEnabled)
    const h = auth[AUTH_HASH_KEY]
    return { readable: true, hash: typeof h === 'string' && h.trim() ? h.trim() : null }
  } catch (e) {
    console.error('Admin Panel password: database override lookup failed:', e)
    return { readable: false, hash: null }
  }
}

async function getDbAdminPanelAccessPasswordHash(): Promise<string | null> {
  return (await lookupDbAdminPanelAccessPasswordHash()).hash
}

function isEnvAdminPanelAccessPasswordConfigured(): boolean {
  const h = process.env.ADMIN_PANEL_ACCESS_PASSWORD_HASH?.trim()
  const p = process.env.ADMIN_PANEL_ACCESS_PASSWORD?.trim()
  return Boolean(h || p)
}

/** Sync env-only check. Prefer the async helper when DB overrides matter. */
export function isAdminPanelAccessPasswordConfiguredFromEnv(): boolean {
  return isEnvAdminPanelAccessPasswordConfigured()
}

/** True when the Admin Panel passphrase can be verified (DB override and/or server env). */
export async function isAdminPanelAccessPasswordConfigured(): Promise<boolean> {
  if (isEnvAdminPanelAccessPasswordConfigured()) return true
  return Boolean(await getDbAdminPanelAccessPasswordHash())
}

/** When true, panel access is blocked until a panel passphrase is configured. */
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
  if (!input) return false

  const lookup = await lookupDbAdminPanelAccessPasswordHash()
  // Deny rather than accept a superseded env password when the override cannot be read.
  if (!lookup.readable) return false
  if (lookup.hash) {
    try {
      return await compare(input, lookup.hash)
    } catch {
      return false
    }
  }

  const hashEnv = process.env.ADMIN_PANEL_ACCESS_PASSWORD_HASH?.trim()
  if (hashEnv) {
    try {
      return await compare(input, hashEnv)
    } catch {
      return false
    }
  }

  const plainEnv = process.env.ADMIN_PANEL_ACCESS_PASSWORD?.trim()
  if (plainEnv) {
    return timingSafeSha256Equal(plainEnv, input)
  }

  return false
}

export type SetAdminPanelAccessPasswordResult =
  | { ok: true; source: 'database' }
  | { ok: false; error: string }

/**
 * Change the Admin Panel passphrase. Stores a bcrypt hash in DB (overrides env until cleared).
 * Requires current password when any panel secret is already configured.
 */
export async function setAdminPanelAccessPassword(params: {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}): Promise<SetAdminPanelAccessPasswordResult> {
  const currentPassword = typeof params.currentPassword === 'string' ? params.currentPassword : ''
  const newPassword = typeof params.newPassword === 'string' ? params.newPassword : ''
  const confirmPassword = typeof params.confirmPassword === 'string' ? params.confirmPassword : ''

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` }
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'New password and confirmation do not match' }
  }

  const configured = await isAdminPanelAccessPasswordConfigured()
  if (configured) {
    const currentOk = await verifyAdminPanelAccessPassword(currentPassword)
    if (!currentOk) {
      return { ok: false, error: 'Current Admin Panel password is incorrect' }
    }
  }

  const passwordHash = await hash(newPassword, 12)

  let row = await getFirstMediaDetailSetting()
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
export async function clearAdminPanelAccessPasswordDbOverride(
  currentPassword: string
): Promise<SetAdminPanelAccessPasswordResult> {
  const dbHash = await getDbAdminPanelAccessPasswordHash()
  if (!dbHash) {
    return { ok: false, error: 'No database Admin Panel password override is set' }
  }
  if (!(await verifyAdminPanelAccessPassword(currentPassword))) {
    return { ok: false, error: 'Current Admin Panel password is incorrect' }
  }
  if (!isEnvAdminPanelAccessPasswordConfigured()) {
    return {
      ok: false,
      error: 'Cannot clear database override while no ADMIN_PANEL_ACCESS_PASSWORD_* is set on the server',
    }
  }

  let row = await getFirstMediaDetailSetting()
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

export async function getAdminPanelAccessPasswordStatus(): Promise<{
  configured: boolean
  source: 'database' | 'environment' | 'none'
  envConfigured: boolean
  databaseOverride: boolean
}> {
  const databaseOverride = Boolean(await getDbAdminPanelAccessPasswordHash())
  const envConfigured = isEnvAdminPanelAccessPasswordConfigured()
  if (databaseOverride) {
    return { configured: true, source: 'database', envConfigured, databaseOverride: true }
  }
  if (envConfigured) {
    return { configured: true, source: 'environment', envConfigured: true, databaseOverride: false }
  }
  return { configured: false, source: 'none', envConfigured: false, databaseOverride: false }
}
