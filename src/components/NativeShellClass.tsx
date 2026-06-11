'use client'

import { useLayoutEffect } from 'react'
import { applyNativeShellLayout, syncNativeSafeAreaInsets } from '@/lib/nativeShellBoot'

/** Ensures Capacitor TestFlight gets safe-area layout (also booted inline in layout.tsx). */
export default function NativeShellClass() {
  useLayoutEffect(() => {
    if (!applyNativeShellLayout()) return

    const root = document.documentElement
    const platform = root.classList.contains('ios')
      ? 'ios'
      : root.classList.contains('android')
        ? 'android'
        : 'unknown'
    const onResize = () => syncNativeSafeAreaInsets(root, platform)
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    }
  }, [])

  return null
}
