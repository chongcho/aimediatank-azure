/**
 * After app sign-in, append this query param when navigating to /admin so middleware
 * clears the httpOnly admin_reauth cookie — Step 2 (admin verification) cannot be skipped
 * by a still-valid cookie from an earlier session.
 */
export const ADMIN_FRESH_STEP2_PARAM = 'ar'

/** sessionStorage: client clears admin_reauth before verify-access when this flag is set. */
export const ADMIN_FORCE_STEP2_STORAGE_KEY = 'adminForceStep2'

export function appendAdminFreshStep2Param(callbackPathWithQuery: string): string {
  const p = callbackPathWithQuery.trim()
  if (p !== '/admin' && !p.startsWith('/admin?')) return p
  if (new RegExp(`(?:^|[?&])${ADMIN_FRESH_STEP2_PARAM}=1(?:&|$)`).test(p)) return p
  return p.includes('?') ? `${p}&${ADMIN_FRESH_STEP2_PARAM}=1` : `${p}?${ADMIN_FRESH_STEP2_PARAM}=1`
}

/** Matches server-side admin checks (case-insensitive). */
export function isAppAdminRole(role: string | undefined | null): boolean {
  if (role == null || typeof role !== 'string') return false
  return role.trim().toUpperCase() === 'ADMIN'
}
