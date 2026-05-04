'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type GuestGeoLocaleContextValue = {
  /** BCP-47-ish UI tag from server IP → country lookup; null until {@link ensureLoaded} completes. */
  localeTagFromIp: string | null
  /** Fetches `/api/ui/geo-locale` once per tab (idempotent). */
  ensureLoaded: () => Promise<void>
}

const GuestGeoLocaleContext = createContext<GuestGeoLocaleContextValue | null>(null)

export function GuestGeoLocaleProvider({ children }: { children: ReactNode }) {
  const [localeTagFromIp, setLocaleTagFromIp] = useState<string | null>(null)
  const resolvedRef = useRef<string | null>(null)
  const inFlightRef = useRef<Promise<void> | null>(null)

  const ensureLoaded = useCallback(async () => {
    if (resolvedRef.current !== null) return
    if (inFlightRef.current) {
      await inFlightRef.current
      return
    }
    const p = (async () => {
      try {
        const r = await fetch('/api/ui/geo-locale', { credentials: 'same-origin', cache: 'no-store' })
        const d = (await r.json()) as { localeTag?: unknown }
        const t = typeof d.localeTag === 'string' ? d.localeTag.trim() : ''
        const tag = t || 'en'
        resolvedRef.current = tag
        setLocaleTagFromIp(tag)
      } catch {
        resolvedRef.current = 'en'
        setLocaleTagFromIp('en')
      } finally {
        inFlightRef.current = null
      }
    })()
    inFlightRef.current = p
    await p
  }, [])

  const value = useMemo(
    () => ({ localeTagFromIp, ensureLoaded }),
    [localeTagFromIp, ensureLoaded],
  )

  return <GuestGeoLocaleContext.Provider value={value}>{children}</GuestGeoLocaleContext.Provider>
}

export function useGuestGeoLocale(): GuestGeoLocaleContextValue {
  const ctx = useContext(GuestGeoLocaleContext)
  if (!ctx) {
    throw new Error('useGuestGeoLocale must be used within GuestGeoLocaleProvider')
  }
  return ctx
}
