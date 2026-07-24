/**
 * Cookie name + expiry payload for clearing admin re-auth (Edge-safe; no Node crypto).
 */
export const ADMIN_REAUTH_COOKIE_NAME = 'admin_reauth'

/**
 * Admin Panel elevation idle window.
 * Cookie slides (renews) while the admin is actively using the panel;
 * after this many seconds with no access, elevation ends and Step 2 is required again.
 */
export const ADMIN_REAUTH_IDLE_SEC = 60

export function buildExpiredAdminReauthCookie(): {
  name: string
  value: string
  options: { path: string; maxAge: number; sameSite: 'lax'; httpOnly: boolean; secure: boolean }
} {
  const secure = process.env.NODE_ENV === 'production'
  return {
    name: ADMIN_REAUTH_COOKIE_NAME,
    value: '',
    options: {
      path: '/',
      maxAge: 0,
      sameSite: 'lax',
      httpOnly: true,
      secure,
    },
  }
}
