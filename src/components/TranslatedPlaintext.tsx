'use client'

import { useTranslatedSingle } from '@/hooks/useTranslatedTexts'
import { useUiLocale } from '@/hooks/useUiLocale'

type PlainElement = 'span' | 'p'

/**
 * Machine-translates a single user-visible string using {@link useUiLocale}'s `mtLocaleTag`
 * (profile locale, else browser when profile is English).
 */
export function TranslatedPlaintext({
  text,
  className,
  as = 'span',
}: {
  text: string
  className?: string
  as?: PlainElement
}) {
  const { mtLocaleTag } = useUiLocale()
  const s = text ?? ''
  const out = useTranslatedSingle(s, mtLocaleTag, Boolean(s.trim()))
  const El = as
  return <El className={className}>{out}</El>
}
