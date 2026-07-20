'use client'

import { TranslatedPlaintext } from '@/components/TranslatedPlaintext'
import { useLanguageModeMt } from '@/hooks/useLanguageModeMt'

/** UI chrome: English when Navbar mode is Original; MT to local locale when Local. */
export function LanguageModeTrans({
  text,
  className,
  as = 'span',
}: {
  text: string
  className?: string
  as?: 'span' | 'p'
}) {
  const { translateEnabled, mtTag } = useLanguageModeMt()
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
