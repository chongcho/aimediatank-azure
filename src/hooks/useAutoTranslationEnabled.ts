'use client'

import { useEffect, useState } from 'react'

/** Reads `HomeLayoutSetting.autoTranslation` via `/api/ui/home-layout` (defaults ON). */
export function useAutoTranslationEnabled() {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch(`/api/ui/home-layout?_=${Date.now()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
        .then((r) => r.json())
        .then((d: { autoTranslation?: unknown }) => {
          if (cancelled) return
          setEnabled(d.autoTranslation !== false)
        })
        .catch(() => {})
    }
    load()
    window.addEventListener('homeLayoutUpdated', load)
    window.addEventListener('mediaBadgeSettingsUpdated', load)
    return () => {
      cancelled = true
      window.removeEventListener('homeLayoutUpdated', load)
      window.removeEventListener('mediaBadgeSettingsUpdated', load)
    }
  }, [])

  return enabled
}
