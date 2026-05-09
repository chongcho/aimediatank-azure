import { NextResponse } from 'next/server'
import {
  getAdminReauthFromRequest,
  adminCookieAllowsPanel,
  adminCookieAllowsContentElevation,
} from '@/lib/adminReauthCookie'

/** Valid Admin Panel elevation cookie (panel passphrase + 2FA), or legacy unsigned-scope cookie. */
export function requireAdminPanelElevation(
  request: Request,
  session: { user: { id: string } }
): NextResponse | null {
  const payload = getAdminReauthFromRequest(request)
  if (!payload || payload.userId !== session.user.id || !adminCookieAllowsPanel(payload)) {
    return NextResponse.json({ error: 'Re-authentication required' }, { status: 403 })
  }
  return null
}

/** Login Step 2 and/or Admin Panel verification cookie — required for cross-user content mutations. */
export function requireAdminContentElevation(
  request: Request,
  session: { user: { id: string } }
): NextResponse | null {
  const payload = getAdminReauthFromRequest(request)
  if (!payload || payload.userId !== session.user.id || !adminCookieAllowsContentElevation(payload)) {
    return NextResponse.json(
      { error: 'Admin verification required', code: 'ADMIN_CONTENT_ELEVATION_REQUIRED' },
      { status: 403 }
    )
  }
  return null
}
