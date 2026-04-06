/**
 * Cookie name + expiry payload for clearing admin re-auth (Edge-safe; no Node crypto).
 */
export const ADMIN_REAUTH_COOKIE_NAME = 'admin_reauth'

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
