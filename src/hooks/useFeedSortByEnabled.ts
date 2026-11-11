'use client'

import { useEffect, useState } from 'react'
import {
  fetchFeedBadgePayload,
  getFeedBadgePayloadSync,
  resetFeedBadgePayloadCache,
} from '@/lib/feedBadgePayloadClient'

function readSortByEnabled(): boolean {
  const cached = getFeedBadgePayloadSync()
  if (cached && typeof cached.sortByEnabled === 'boolean') {
    return cached.sortByEnabled !== false
  }
  return true
}

/** Homepage Sort by control from Home Layout (`sortByEnabled`, defaults ON). */
export function useFeedSortByEnabled() {
  const [enabled, setEnabled] = useState(readSortByEnabled)

  useEffect(() => {
    let cancelled = false
    const applyFromBadges = () => {
      void fetchFeedBadgePayload().then((p) => {
        if (cancelled || !p) return
        if (typeof p.sortByEnabled === 'boolean') {
          setEnabled(p.sortByEnabled !== false)
          return
        }
        setEnabled(true)
      })
    }
    const applyFromHomeLayout = () => {
      const bust = `?_=${Date.now()}`
      void fetch(`/api/ui/home-layout${bust}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data) return
          setEnabled(data.sortByEnabled !== false)
        })
        .catch(() => {
          /* keep current */
        })
    }
    applyFromBadges()
    const onUpdate = () => {
      resetFeedBadgePayloadCache()
      applyFromHomeLayout()
      applyFromBadges()
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
