'use client'

import { useEffect, useMemo } from 'react'
import { useFeedCardTextMode } from '@/contexts/FeedCardTextModeContext'
import { useFeedGridAutoTranslation } from '@/hooks/useFeedGridAutoTranslation'
import { useGuestFeedLocalTargets } from '@/hooks/useGuestFeedLocalTargets'

/**
 * Navbar Original vs Local for UI chrome: translate when auto-translation is on and mode is Local.
 * Same rules as AboutTrans / feed cards.
 */
export function useLanguageModeMt() {
  const { mode } = useFeedCardTextMode()
  const feedAutoTranslation = useFeedGridAutoTranslation()
  const translateEnabled = Boolean(feedAutoTranslation && mode === 'local')
  const { mtTag, guestLocal, ensureGuestGeoLoaded } = useGuestFeedLocalTargets(feedAutoTranslation)

  useEffect(() => {
    if (guestLocal) void ensureGuestGeoLoaded()
  }, [guestLocal, ensureGuestGeoLoaded])

  return useMemo(
    () => ({ translateEnabled, mtTag }),
    [translateEnabled, mtTag]
  )
}
