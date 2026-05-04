'use client'

import { useTranslatedSingle } from '@/hooks/useTranslatedTexts'
import { useUiLocale } from '@/hooks/useUiLocale'

type PlainElement = 'span' | 'p'

/**
 * Machine-translates a single user-visible string using {@link useUiLocale}'s `mtLocaleTag`
 * (profile locale, else browser when profile is English), unless `mtLocaleTagOverride` is set.
 */
export function TranslatedPlaintext({
  text,
  className,
  as = 'span',
  translateEnabled = true,
  mtLocaleTagOverride,
}: {
  text: string
  className?: string
  as?: PlainElement
  /** When false, skip `/api/translate/text` (admin “Automatic translation” off). */
  translateEnabled?: boolean
  /** When set (e.g. guest feed “Local” IP locale), used instead of {@link useUiLocale}'s `mtLocaleTag`. */
  mtLocaleTagOverride?: string
}) {
  const { mtLocaleTag } = useUiLocale()
  const toTag = mtLocaleTagOverride ?? mtLocaleTag
  const s = text ?? ''
  const out = useTranslatedSingle(s, toTag, translateEnabled && Boolean(s.trim()))
  const El = as
  return <El className={className}>{out}</El>
}
