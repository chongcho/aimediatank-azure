// Signed cookie for admin re-authentication (ADMIN_PANEL_ACCESS_PASSWORD_* passphrase + 2FA).
// Sliding idle window: renews while the admin is actively using the panel; expires after idle.

import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import {
  ADMIN_REAUTH_COOKIE_NAME,
  ADMIN_REAUTH_IDLE_SEC,
} from './adminReauthConstants'

const COOKIE_NAME = ADMIN_REAUTH_COOKIE_NAME
const MAX_AGE_SEC = ADMIN_REAUTH_IDLE_SEC
const SECRET = process.env.NEXTAUTH_SECRET ?? ''

/** What the signed admin cookie authorizes. Legacy payloads omit scopes → treated as panel-only. */
export type AdminReauthScope = 'panel' | 'app'

export interface AdminReauthPayload {
  userId: string
  exp: number
  scopes?: AdminReauthScope[]
}

export function normalizeAdminReauthScopes(payload: AdminReauthPayload): AdminReauthScope[] {
  const s = payload.scopes
  if (!Array.isArray(s) || s.length === 0) {
    return ['panel']
  }
  return s.filter((x): x is AdminReauthScope => x === 'panel' || x === 'app')
}

/** Dashboard + /api/admin/* style routes (Admin Panel passphrase + 2FA), or legacy cookie. */
export function adminCookieAllowsPanel(payload: AdminReauthPayload): boolean {
  return normalizeAdminReauthScopes(payload).includes('panel')
}

/** Cross-user content edits anywhere in the app (login Step 2 + 2FA and/or panel elevation). */
export function adminCookieAllowsContentElevation(payload: AdminReauthPayload): boolean {
  const n = normalizeAdminReauthScopes(payload)
  return n.includes('panel') || n.includes('app')
}

function getSecret(): string {
  if (!SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET must be set in production for admin re-auth cookie signing.')
  }
  if (!SECRET) {
    console.warn('[adminReauthCookie] NEXTAUTH_SECRET not set; admin re-auth cookie is insecure.')
  }
  return SECRET
}

function sign(payload: AdminReauthPayload): string {
  const data = JSON.stringify(payload)
  const sig = createHmac('sha256', getSecret()).update(data).digest('hex')
  return Buffer.from(data, 'utf8').toString('base64url') + '.' + sig
}

export function createAdminReauthCookie(
  userId: string,
  scopes: AdminReauthScope[] = ['panel']
): { name: string; value: string; options: { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; maxAge: number } } {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC
  const value = sign({ userId, exp, scopes })
  const isProduction = process.env.NODE_ENV === 'production'
  return {
    name: COOKIE_NAME,
    value,
    options: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE_SEC,
    },
  }
}

export function verifyAdminReauthCookie(cookieHeader: string | null): AdminReauthPayload | null {
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`))
  const raw = match?.[1]
  if (!raw) return null
  const parts = raw.trim().split('.')
  if (parts.length !== 2) return null
  let data: string
  try {
    data = Buffer.from(parts[0], 'base64url').toString('utf8')
  } catch {
    return null
  }
  const expectedSig = createHmac('sha256', getSecret()).update(data).digest('hex')
  const gotSig = parts[1]
  if (gotSig.length !== expectedSig.length) return null
  try {
    if (!timingSafeEqual(Buffer.from(gotSig, 'utf8'), Buffer.from(expectedSig, 'utf8'))) return null
  } catch {
    return null
  }
  let payload: AdminReauthPayload
  try {
    payload = JSON.parse(data) as AdminReauthPayload
  } catch {
    return null
  }
  if (!payload.userId || typeof payload.exp !== 'number') return null
  if (payload.scopes !== undefined && !Array.isArray(payload.scopes)) return null
  if (payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

export function getAdminReauthFromRequest(request: Request): AdminReauthPayload | null {
  const cookieHeader = request.headers.get('cookie')
  return verifyAdminReauthCookie(cookieHeader)
}

/** Renew elevation expiry (sliding idle). Call on successful admin panel access. */
export function applySlidingAdminReauthCookie(
  response: NextResponse,
  request: Request,
  userId: string
): NextResponse {
  const payload = getAdminReauthFromRequest(request)
  if (!payload || payload.userId !== userId) return response
  const cookie = createAdminReauthCookie(userId, normalizeAdminReauthScopes(payload))
  response.cookies.set(cookie.name, cookie.value, cookie.options)
  return response
}

/** Cookie options for Server Components / `cookies().set` after a successful panel gate. */
export function slidingAdminReauthCookieForUser(
  userId: string,
  scopes?: AdminReauthScope[]
): { name: string; value: string; options: { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; maxAge: number } } {
  return createAdminReauthCookie(userId, scopes ?? ['panel'])
}
