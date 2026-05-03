'use client'

import { useSession } from 'next-auth/react'
import { useCallback, useLayoutEffect, useState } from 'react'
import { EMPTY_PROFILE_LOCATION_UI_LOCALE, localeTagFromBrowserLang } from '@/lib/localeFromLocation'
import { feedCardT, type FeedCardKey } from '@/messages/feedCard'
import { navBarT, type NavBarKey } from '@/messages/navBar'
import { mediaPageT, type MediaPageKey } from '@/messages/mediaPage'

export function useUiLocale() {
  const { data: session, status } = useSession()
  const [browserTag, setBrowserTag] = useState('en')

  /** Before paint on client: avoid a long `en` window where MT is skipped and bundled UI stays English. */
  useLayoutEffect(() => {
    const apply = () =>
      setBrowserTag(localeTagFromBrowserLang(typeof navigator !== 'undefined' ? navigator.language : null))
    apply()
    window.addEventListener('languagechange', apply)
    return () => window.removeEventListener('languagechange', apply)
  }, [])

  /**
   * Guests: browser language.
   * Signed-in: JWT `locale` from profile **Location** only (`SessionLocaleFromProfileSync` + `auth.ts`).
   * If location is empty, we treat it like **United States**: English only (`en`); the JWT should match
   * via `SessionLocaleFromProfileSync`. We do **not** fall back to the browser, so empty location never
   * follows `navigator.language`.
   */
  const localeTag =
    status === 'authenticated'
      ? (() => {
          const s = session?.user?.locale
          const t = typeof s === 'string' ? s.trim() : ''
          return t || EMPTY_PROFILE_LOCATION_UI_LOCALE
        })()
      : browserTag

  const t = useCallback((key: NavBarKey) => navBarT(localeTag, key), [localeTag])
  const tMedia = useCallback((key: MediaPageKey) => mediaPageT(localeTag, key), [localeTag])
  const tFeed = useCallback(
    (key: FeedCardKey, vars?: Record<string, string>) => feedCardT(localeTag, key, vars),
    [localeTag]
  )

  return { localeTag, t, tMedia, tFeed }
}
