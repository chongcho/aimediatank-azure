'use client'

import { useEffect, useState } from 'react'
import { fetchFeedBadgePayload, resetFeedBadgePayloadCache } from '@/lib/feedBadgePayloadClient'

/** `autoTranslation` from `/api/ui/badges` (defaults ON until first fetch). */
export function useFeedGridAutoTranslation() {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    let cancelled = false
    const apply = () => {
      void fetchFeedBadgePayload().then((p) => {
        if (cancelled || !p) return
        setEnabled(p.autoTranslation !== false)
      })
    }
    apply()
    const onUpdate = () => {
      resetFeedBadgePayloadCache()
      apply()
    }
    window.addEventListener('mediaBadgeSettingsUpdated', onUpdate)
    window.addEventListener('homeLayoutUpdated', onUpdate)
    return () => {
      cancelled = true
      window.removeEventListener('mediaBadgeSettingsUpdated', onUpdate)
      window.removeEventListener('homeLayoutUpdated', onUpdate)
    }
  }, [])

  return enabled
}
