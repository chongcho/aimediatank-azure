'use client'

import { useEffect, useState } from 'react'
import {
  fetchFeedBadgePayload,
  getFeedBadgePayloadSync,
  resetFeedBadgePayloadCache,
} from '@/lib/feedBadgePayloadClient'

function readSortByEnabled(): boolean {
  const items = getFeedBadgePayloadSync()?.items
  if (!items) return true
  const row = items.find((i) => i.itemKey === 'sortBy')
  return row ? row.isEnabled !== false : true
}

/** Homepage Sort by control from `/api/ui/badges` (defaults ON until first fetch). */
export function useFeedSortByEnabled() {
  const [enabled, setEnabled] = useState(readSortByEnabled)

  useEffect(() => {
    let cancelled = false
    const apply = () => {
      void fetchFeedBadgePayload().then((p) => {
        if (cancelled || !p) return
        const row = p.items.find((i) => i.itemKey === 'sortBy')
        setEnabled(row ? row.isEnabled !== false : true)
      })
    }
    apply()
    const onUpdate = () => {
      resetFeedBadgePayloadCache()
      apply()
    }
    window.addEventListener('mediaBadgeSettingsUpdated', onUpdate)
    return () => {
      cancelled = true
      window.removeEventListener('mediaBadgeSettingsUpdated', onUpdate)
    }
  }, [])

  return enabled
}
