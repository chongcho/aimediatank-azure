// Signed cookie for admin re-authentication (account or ADMIN_PANEL_ACCESS_PASSWORD_HASH password + 2FA). Short-lived so admins
// must re-verify periodically when accessing the panel.

import { createHmac, timingSafeEqual } from 'crypto'
import { ADMIN_REAUTH_COOKIE_NAME } from './adminReauthConstants'

const COOKIE_NAME = ADMIN_REAUTH_COOKIE_NAME
const MAX_AGE_SEC = 30 * 60 // 30 minutes
const SECRET = process.env.NEXTAUTH_SECRET ?? ''

export interface AdminReauthPayload {
  userId: string
  exp: number
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

export function createAdminReauthCookie(userId: string): { name: string; value: string; options: { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; maxAge: number } } {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC
  const value = sign({ userId, exp })
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
  if (payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

export function getAdminReauthFromRequest(request: Request): AdminReauthPayload | null {
  const cookieHeader = request.headers.get('cookie')
  return verifyAdminReauthCookie(cookieHeader)
}
