/**
 * Shared constants for the native social sign-in handoff.
 *
 * Google refuses OAuth inside embedded WebViews, so the native app opens the flow in the system
 * browser (Chrome Custom Tabs on Android, ASWebAuthenticationSession on iOS). The session cookie
 * lands in the browser, not the app, so the browser mints a one-time code and hands it back over
 * the app's custom URL scheme; the WebView redeems it for its own NextAuth session.
 */

/** NextAuth provider id that redeems the one-time handoff code. */
export const NATIVE_HANDOFF_PROVIDER_ID = 'native-handoff'

/** Must match the Android intent-filter and the iOS CFBundleURLSchemes entry. */
export const NATIVE_AUTH_SCHEME = 'aimediatank'
export const NATIVE_AUTH_RETURN_HOST = 'auth-return'
export const NATIVE_AUTH_CALLBACK_URL = `${NATIVE_AUTH_SCHEME}://${NATIVE_AUTH_RETURN_HOST}`

export const NATIVE_AUTH_START_PATH = '/auth/native-start'
export const NATIVE_AUTH_COMPLETE_PATH = '/auth/native-complete'
export const NATIVE_AUTH_RETURN_PATH = '/auth/native-return'

/** Only allow same-site destinations so a crafted deep link cannot bounce users off-site. */
export function safeNextPath(value: string | null | undefined): string {
  const next = (value || '').trim()
  if (!next.startsWith('/') || next.startsWith('//')) return '/'
  return next
}

export function buildNativeReturnUrl(code: string, next: string): string {
  const url = new URL(NATIVE_AUTH_CALLBACK_URL)
  url.searchParams.set('code', code)
  url.searchParams.set('next', safeNextPath(next))
  return url.toString()
}
