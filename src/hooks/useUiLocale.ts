'use client'

import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useState } from 'react'
import { localeTagFromBrowserLang } from '@/lib/localeFromLocation'
import { feedCardT, type FeedCardKey } from '@/messages/feedCard'
import { navBarT, type NavBarKey } from '@/messages/navBar'
import { mediaPageT, type MediaPageKey } from '@/messages/mediaPage'

export function useUiLocale() {
  const { data: session, status } = useSession()
  const [browserTag, setBrowserTag] = useState('en')

  useEffect(() => {
    setBrowserTag(localeTagFromBrowserLang(typeof navigator !== 'undefined' ? navigator.language : null))
  }, [])

  /** Signed-in: JWT `locale` from Profile/Location (see `auth.ts` + profile `update()`). Guests: browser. */
  const localeTag =
    status === 'authenticated' ? (session?.user?.locale ?? browserTag) : browserTag

  const t = useCallback((key: NavBarKey) => navBarT(localeTag, key), [localeTag])
  const tMedia = useCallback((key: MediaPageKey) => mediaPageT(localeTag, key), [localeTag])
  const tFeed = useCallback(
    (key: FeedCardKey, vars?: Record<string, string>) => feedCardT(localeTag, key, vars),
    [localeTag]
  )

  return { localeTag, t, tMedia, tFeed }
}
