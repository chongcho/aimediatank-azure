/**
 * Admin Panel navigation helpers.
 * Soft App Router navigations to /admin are unreliable once admin_reauth expires
 * (server redirect to /admin/reauth can look like a no-op click). Prefer hard loads.
 */

export const ADMIN_PANEL_PATH = '/admin'
export const ADMIN_REAUTH_PATH = '/admin/reauth'

export function goToAdminPanel() {
  if (typeof window === 'undefined') return
  window.location.assign(ADMIN_PANEL_PATH)
}

export function goToAdminReauth() {
  if (typeof window === 'undefined') return
  window.location.assign(ADMIN_REAUTH_PATH)
}

/** True when /api/admin* rejected the request because Step 2 elevation expired. */
export function isAdminReauthRequiredResponse(
  res: Response,
  body?: { error?: string; code?: string } | null
): boolean {
  if (res.status !== 403) return false
  const err = typeof body?.error === 'string' ? body.error : ''
  if (err === 'Re-authentication required') return true
  if (body?.code === 'ADMIN_CONTENT_ELEVATION_REQUIRED') return true
  return /re-?auth/i.test(err)
}
