'use client'

import { useEffect } from 'react'
import { TranslatedPlaintext } from '@/components/TranslatedPlaintext'
import { useFeedCardTextMode } from '@/contexts/FeedCardTextModeContext'
import { useFeedGridAutoTranslation } from '@/hooks/useFeedGridAutoTranslation'
import { useGuestFeedLocalTargets } from '@/hooks/useGuestFeedLocalTargets'

/** About copy: same rules as feed — translate when badges auto-translation is on and navbar mode is Local. */
export function AboutTrans({
  text,
  className,
  as = 'span',
}: {
  text: string
  className?: string
  as?: 'span' | 'p'
}) {
  const { mode } = useFeedCardTextMode()
  const feedAutoTranslation = useFeedGridAutoTranslation()
  const translateEnabled = Boolean(feedAutoTranslation && mode === 'local')
  const { mtTag, guestLocal, ensureGuestGeoLoaded } = useGuestFeedLocalTargets(feedAutoTranslation)
  useEffect(() => {
    if (guestLocal) void ensureGuestGeoLoaded()
  }, [guestLocal, ensureGuestGeoLoaded])
  return (
    <TranslatedPlaintext
      text={text}
      className={className}
      as={as}
      translateEnabled={translateEnabled}
      mtLocaleTagOverride={mtTag}
    />
  )
}
