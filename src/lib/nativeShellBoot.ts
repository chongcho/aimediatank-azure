/** iOS notch fallback when env(safe-area-inset-top) is 0 in Capacitor WKWebView. */
const IOS_SAFE_TOP_FALLBACK_PX = 47
/** iOS home-indicator fallback when env(safe-area-inset-bottom) is 0 in Capacitor WKWebView. */
const IOS_SAFE_BOTTOM_FALLBACK_PX = 34

export function getNativePlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web'

  const cap = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor
  const fromCap = cap?.getPlatform?.()
  if (fromCap === 'ios' || fromCap === 'android') return fromCap

  if (detectNativeShell()) {
    const ua = navigator.userAgent
    if (/iPhone|iPod|iPad/.test(ua)) return 'ios'
    if (/Android/.test(ua)) return 'android'
  }

  return 'web'
}

/** True when running inside the Capacitor native app (TestFlight / Play), not Safari PWA. */
export function detectNativeShell(): boolean {
  if (typeof window === 'undefined') return false

  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (cap?.isNativePlatform?.()) return true

  if (window.matchMedia('(display-mode: standalone)').matches) return false
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone) return false

  const ua = navigator.userAgent
  if (/Android/.test(ua) && /; wv\)/.test(ua)) return true

  if (!/iPhone|iPod|iPad/.test(ua)) return false

  // Capacitor WKWebView: Mobile/… without Safari/604.1 (Safari browser tabs include Safari/).
  return /AppleWebKit/.test(ua) && /Mobile\//.test(ua) && !/Safari\//.test(ua)
}

export function syncNativeSafeAreaInsets(root: HTMLElement, isIOS: boolean): void {
  if (!document.body) return

  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;top:0;left:0;padding-top:env(safe-area-inset-top);padding-top:constant(safe-area-inset-top);visibility:hidden;pointer-events:none;'
  document.body.appendChild(probe)
  let top = parseFloat(getComputedStyle(probe).paddingTop) || 0

  probe.style.cssText =
    'position:fixed;bottom:0;left:0;padding-bottom:env(safe-area-inset-bottom);padding-bottom:constant(safe-area-inset-bottom);visibility:hidden;pointer-events:none;'
  let bottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0
  probe.remove()

  if (isIOS && top < 1) top = IOS_SAFE_TOP_FALLBACK_PX
  if (isIOS && bottom < 1) bottom = IOS_SAFE_BOTTOM_FALLBACK_PX

  root.style.setProperty('--app-safe-top', `${top}px`)
  root.style.setProperty('--app-safe-bottom', `${bottom}px`)
}

/** Tag html/body and set --app-safe-top for Capacitor TestFlight layout. */
export function applyNativeShellLayout(): boolean {
  if (!detectNativeShell()) return false

  const root = document.documentElement
  const cap = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor
  root.classList.add('capacitor-native')
  document.body?.classList.add('capacitor-native-body')

  const platform =
    cap?.getPlatform?.() ||
    (/Android/.test(navigator.userAgent)
      ? 'android'
      : /iPad|iPhone|iPod/.test(navigator.userAgent)
        ? 'ios'
        : 'unknown')
  if (platform !== 'unknown') root.classList.add(platform)

  syncNativeSafeAreaInsets(root, platform === 'ios')
  ;(window as Window & { __AIM_NATIVE_SHELL__?: boolean }).__AIM_NATIVE_SHELL__ = true
  return true
}
