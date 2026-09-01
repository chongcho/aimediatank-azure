import { NextResponse } from 'next/server'
import { detectNativeShell, getNativePlatform } from '@/lib/nativeShellBoot'

/** Client sends this on native iOS so server routes can reject external checkout. */
export const NATIVE_IOS_REQUEST_HEADER = 'x-amt-native-ios'

const IOS_EXTERNAL_PAYMENTS_MESSAGE =
  'Purchases and subscriptions are not available in the iOS app. Sign in on aimediatank.com in Safari to subscribe or buy content.'

/** True in Capacitor iOS shell (TestFlight / App Store), not mobile Safari. */
export function isNativeIosApp(): boolean {
  if (typeof window === 'undefined') return false
  return detectNativeShell() && getNativePlatform() === 'ios'
}

export function isNativeIosClientFromRequest(request: Request): boolean {
  const header = request.headers.get(NATIVE_IOS_REQUEST_HEADER)
  if (header === '1' || header?.toLowerCase() === 'true') return true
  const ua = request.headers.get('user-agent') ?? ''
  return /iPad|iPhone|iPod/i.test(ua) && /Capacitor|AiMediaTank/i.test(ua)
}

export function iosExternalPaymentsBlockedResponse() {
  return NextResponse.json({ error: IOS_EXTERNAL_PAYMENTS_MESSAGE }, { status: 403 })
}

export function blockIosNativeExternalPayments(request: Request): boolean {
  return isNativeIosClientFromRequest(request)
}

export function withNativeIosHeader(headers?: HeadersInit): Headers {
  const next = new Headers(headers)
  if (isNativeIosApp()) {
    next.set(NATIVE_IOS_REQUEST_HEADER, '1')
  }
  return next
}

export function nativeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: withNativeIosHeader(init?.headers),
  })
}

/** Use full-page navigation in the native shell (avoids broken @modal intercept routes). */
export function navigateInNativeShell(href: string) {
  if (typeof window === 'undefined') return
  window.location.assign(href)
}

export function nativeShellLinkClick(href: string, event?: { preventDefault: () => void }) {
  if (!detectNativeShell()) return false
  event?.preventDefault()
  navigateInNativeShell(href)
  return true
}

export { IOS_EXTERNAL_PAYMENTS_MESSAGE }
