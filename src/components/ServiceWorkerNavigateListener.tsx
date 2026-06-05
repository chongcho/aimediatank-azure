'use client'

import { useEffect } from 'react'

/** Routes open app tabs when a generic push notification is tapped (see public/sw.js). */
export default function ServiceWorkerNavigateListener() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null
      if (data?.type !== 'NOTIFICATION_NAVIGATE' || !data.url) return

      try {
        const target = new URL(data.url, window.location.origin)
        const current =
          window.location.pathname + window.location.search + window.location.hash
        const desired = target.pathname + target.search + target.hash
        if (current !== desired) {
          window.location.assign(target.href)
        }
      } catch {
        window.location.assign(data.url)
      }
    }

    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])

  return null
}
