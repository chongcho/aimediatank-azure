'use client'

import { useEffect } from 'react'
import { useUiLocale } from '@/hooks/useUiLocale'
import { htmlLangFromUiTag } from '@/messages/navBar'

/** Sets `<html lang>` from resolved UI locale (session location or browser). */
export default function DocumentLang() {
  const { localeTag } = useUiLocale()
  useEffect(() => {
    document.documentElement.lang = htmlLangFromUiTag(localeTag)
  }, [localeTag])
  return null
}
