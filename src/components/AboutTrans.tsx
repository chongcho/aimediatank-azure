'use client'

import { TranslatedPlaintext } from '@/components/TranslatedPlaintext'
import { useFeedCardTextMode } from '@/contexts/FeedCardTextModeContext'
import { useFeedGridAutoTranslation } from '@/hooks/useFeedGridAutoTranslation'

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
  return <TranslatedPlaintext text={text} className={className} as={as} translateEnabled={translateEnabled} />
}
