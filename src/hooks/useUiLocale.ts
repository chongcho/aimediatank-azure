'use client'

import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useState } from 'react'
import { localeTagFromBrowserLang } from '@/lib/localeFromLocation'
import { navBarT, type NavBarKey } from '@/messages/navBar'

export function useUiLocale() {
  const { data: session, status } = useSession()
  const [browserTag, setBrowserTag] = useState('en')

  useEffect(() => {
    setBrowserTag(localeTagFromBrowserLang(typeof navigator !== 'undefined' ? navigator.language : null))
  }, [])

  const localeTag =
    status === 'authenticated' ? (session?.user?.locale ?? browserTag) : browserTag

  const t = useCallback((key: NavBarKey) => navBarT(localeTag, key), [localeTag])

  return { localeTag, t }
}
