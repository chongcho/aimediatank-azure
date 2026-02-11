'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { stopAllMedia } from '@/lib/mediaStop'

/**
 * Safety-net component that stops all media playback whenever the route changes.
 * Place in the root layout so it covers every navigation (Back, Forward, Link click, router.push).
 * This catches edge-cases where component-level cleanup in MediaPlayer might miss
 * detached elements or race with concurrent React transitions.
 */
export default function RouteChangeMediaStopper() {
  const pathname = usePathname()
  const prevPathname = useRef(pathname)

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      stopAllMedia()
      prevPathname.current = pathname
    }
  }, [pathname])

  return null
}
