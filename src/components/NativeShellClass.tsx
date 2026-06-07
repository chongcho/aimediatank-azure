'use client'

import { useLayoutEffect } from 'react'
import { applyNativeShellLayout, syncNativeSafeAreaInsets } from '@/lib/nativeShellBoot'

/** Ensures Capacitor TestFlight gets safe-area layout (also booted inline in layout.tsx). */
export default function NativeShellClass() {
  useLayoutEffect(() => {
    if (!applyNativeShellLayout()) return

    const root = document.documentElement
    const isIOS = root.classList.contains('ios')
    const onResize = () => syncNativeSafeAreaInsets(root, isIOS)
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    }
  }, [])

  return null
}
