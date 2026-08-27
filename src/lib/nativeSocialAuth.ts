'use client'

/**
 * Social sign-in for the native app.
 *
 * Google blocks OAuth inside embedded WebViews (403 disallowed_useragent), which is what a
 * Capacitor shell is, so signing in from the app requires an external user agent per RFC 8252:
 * Chrome Custom Tabs on Android, ASWebAuthenticationSession on iOS. The session cookie then lives
 * in the browser rather than the WebView, so the browser hands back a one-time code over the
 * app's custom URL scheme and the WebView redeems it for its own session.
 */

import { registerPlugin } from '@capacitor/core'
import { detectNativeShell, getNativePlatform } from '@/lib/nativeShellBoot'
import {
  NATIVE_AUTH_CALLBACK_URL,
  NATIVE_AUTH_RETURN_HOST,
  NATIVE_AUTH_RETURN_PATH,
  NATIVE_AUTH_SCHEME,
  NATIVE_AUTH_START_PATH,
  safeNextPath,
} from '@/lib/nativeAuthFlow'

type NativeAuthSessionPlugin = {
  /** Presents ASWebAuthenticationSession and resolves with the callback URL. */
  start(options: { url: string; callbackScheme: string }): Promise<{ url: string }>
}

const NativeAuthSession = registerPlugin<NativeAuthSessionPlugin>('NativeAuthSession')

export function shouldUseNativeSocialAuth(): boolean {
  return detectNativeShell()
}

function buildStartUrl(providerId: string, callbackUrl: string, platform: 'ios' | 'android'): string {
  const url = new URL(NATIVE_AUTH_START_PATH, window.location.origin)
  url.searchParams.set('provider', providerId)
  url.searchParams.set('next', safeNextPath(callbackUrl))
  url.searchParams.set('platform', platform)
  return url.toString()
}

/** Turn `aimediatank://auth-return?code=…&next=…` into the in-app page that redeems the code. */
function returnPathFromDeepLink(rawUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== `${NATIVE_AUTH_SCHEME}:`) return null
  // Custom-scheme URLs put the "host" in either host or pathname depending on platform.
  const target = parsed.host || parsed.pathname.replace(/^\/+/, '')
  if (target !== NATIVE_AUTH_RETURN_HOST) return null

  const code = parsed.searchParams.get('code')
  if (!code) return null

  const next = safeNextPath(parsed.searchParams.get('next'))
  return `${NATIVE_AUTH_RETURN_PATH}?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`
}

async function startIosSignIn(startUrl: string): Promise<void> {
  // ASWebAuthenticationSession shares Safari's cookies and returns the callback URL directly,
  // so no deep-link listener is needed on iOS.
  const { url } = await NativeAuthSession.start({
    url: startUrl,
    callbackScheme: NATIVE_AUTH_SCHEME,
  })
  const returnPath = returnPathFromDeepLink(url)
  if (!returnPath) throw new Error('Sign-in was cancelled')
  window.location.replace(returnPath)
}

/** Cancelling a Custom Tab leaves the listener attached; keep at most one across retries. */
let androidReturnListener: { remove: () => Promise<void> } | null = null

async function startAndroidSignIn(startUrl: string): Promise<void> {
  const [{ Browser }, { App }] = await Promise.all([
    import('@capacitor/browser'),
    import('@capacitor/app'),
  ])

  await androidReturnListener?.remove().catch(() => undefined)

  // Custom Tabs cannot return a value, so the redirect comes back as an app URL open.
  androidReturnListener = await App.addListener('appUrlOpen', ({ url }) => {
    const returnPath = returnPathFromDeepLink(url)
    if (!returnPath) return
    void androidReturnListener?.remove().catch(() => undefined)
    androidReturnListener = null
    void Browser.close().catch(() => undefined)
    window.location.replace(returnPath)
  })

  await Browser.open({ url: startUrl })
}

/**
 * Opens the provider's sign-in flow in the system browser. Resolves once the browser is showing;
 * the sign-in itself completes later via the deep link back into the app.
 */
export async function startNativeSocialSignIn(
  providerId: string,
  callbackUrl: string,
): Promise<void> {
  const platform = getNativePlatform()
  if (platform !== 'ios' && platform !== 'android') {
    throw new Error('Native sign-in is only available in the app')
  }

  const startUrl = buildStartUrl(providerId, callbackUrl, platform)

  if (platform === 'ios') {
    await startIosSignIn(startUrl)
    return
  }
  await startAndroidSignIn(startUrl)
}

export { NATIVE_AUTH_CALLBACK_URL }
