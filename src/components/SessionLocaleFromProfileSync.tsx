'use client'

import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useRef } from 'react'

/**
 * Keeps JWT `session.user.locale` aligned with `User.location` in the database.
 * Empty location is stored as null/'' and maps to English (same as **United States**); the JWT should
 * be `en` so UI and `/api/translate/text` stay English for signed-in users.
 */
export default function SessionLocaleFromProfileSync() {
  const { data: session, status, update } = useSession()
  const busy = useRef(false)
  const sessionRef = useRef(session)
  sessionRef.current = session

  const syncLocaleFromDb = useCallback(async () => {
    const s = sessionRef.current
    if (status !== 'authenticated' || !s?.user?.id) return

    try {
      const res = await fetch('/api/user/profile', { cache: 'no-store', credentials: 'same-origin' })
      if (!res.ok) return
      const data = (await res.json()) as { localeFromProfileLocation?: string }

      const fromProfile = data.localeFromProfileLocation
      if (typeof fromProfile !== 'string' || !fromProfile.trim()) return

      const fromSession = s.user.locale
      if (fromSession === fromProfile) return
      if (busy.current) return
      busy.current = true
      // Partial merge: jwt callback only applies fields present on `session.user`.
      await update({ user: { locale: fromProfile } })
    } catch {
      // ignore
    } finally {
      busy.current = false
    }
  }, [status, update])

  useEffect(() => {
    void syncLocaleFromDb()
  }, [status, session?.user?.id, syncLocaleFromDb])

  useEffect(() => {
    const onProfile = () => {
      void syncLocaleFromDb()
    }
    window.addEventListener('profileUpdated', onProfile)
    // After hard navigation from profile save, re-sync once the session is ready.
    if (status === 'authenticated') {
      void syncLocaleFromDb()
    }
    return () => window.removeEventListener('profileUpdated', onProfile)
  }, [status, syncLocaleFromDb])

  return null
}
