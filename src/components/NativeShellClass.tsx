'use client'

import { useLayoutEffect } from 'react'
import { Capacitor } from '@capacitor/core'

/** Tag html/body so Capacitor TestFlight gets the same safe-area layout as installed PWA. */
export default function NativeShellClass() {
  useLayoutEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const root = document.documentElement
    root.classList.add('capacitor-native', Capacitor.getPlatform())
    document.body.classList.add('capacitor-native-body')
  }, [])

  return null
}
