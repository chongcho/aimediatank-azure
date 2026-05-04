'use client'

import { useSession } from 'next-auth/react'
import { useMemo } from 'react'
import { useFeedCardTextMode } from '@/contexts/FeedCardTextModeContext'
import { useGuestGeoLocale } from '@/contexts/GuestGeoLocaleContext'
import { useUiLocale } from '@/hooks/useUiLocale'

/**
 * Bundled + MT locale targets for feed-style "Local" when the user is not signed in:
 * after {@link useGuestGeoLocale}'s `ensureLoaded`, uses IP-derived region (same mapping as profile Location).
 */
export function useGuestFeedLocalTargets(autoTranslationOn: boolean) {
  const { status } = useSession()
  const { mode } = useFeedCardTextMode()
  const { localeTag, mtLocaleTag } = useUiLocale()
  const { localeTagFromIp, ensureLoaded } = useGuestGeoLocale()

  const isGuest = status === 'unauthenticated'
  const localActive = autoTranslationOn && mode === 'local'
  const guestLocal = isGuest && localActive

  return useMemo(() => {
    const bundledTag = guestLocal && localeTagFromIp !== null ? localeTagFromIp : localeTag
    const mtTag = guestLocal && localeTagFromIp !== null ? localeTagFromIp : mtLocaleTag
    return { bundledTag, mtTag, guestLocal, ensureGuestGeoLoaded: ensureLoaded }
  }, [ensureLoaded, guestLocal, localeTag, localeTagFromIp, mtLocaleTag])
}
