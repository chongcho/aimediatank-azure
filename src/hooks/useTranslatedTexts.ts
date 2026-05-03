'use client'

import { useEffect, useMemo, useState } from 'react'

function fnv1a(s: string): string {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

const clientCache = new Map<string, string[]>()

/**
 * Translates title + long description for feed cards via `/api/translate/text`.
 * Returns originals until translated strings arrive. Skips network for English.
 */
export function useTranslatedPair(
  title: string,
  description: string,
  localeTag: string | undefined,
  enabled: boolean
): { title: string; description: string } {
  const t0 = title ?? ''
  const t1 = description ?? ''

  const [out, setOut] = useState<[string, string]>(() => [t0, t1])

  useEffect(() => {
    setOut([t0, t1])
  }, [t0, t1])

  const cacheKey = useMemo(() => {
    if (!enabled || (!t0.trim() && !t1.trim())) return ''
    const primary = (localeTag || 'en').toLowerCase().split('-')[0]
    if (primary === 'en') return ''
    return `${localeTag || 'en'}::${fnv1a(`${t0}\u0001${t1.slice(0, 8000)}`)}`
  }, [enabled, localeTag, t0, t1])

  useEffect(() => {
    if (!cacheKey) return
    const primary = (localeTag || 'en').toLowerCase().split('-')[0]
    if (primary === 'en') return

    const cached = clientCache.get(cacheKey)
    if (cached && cached.length === 2) {
      setOut([cached[0], cached[1]])
      return
    }

    const body = {
      texts: [t0, t1.length > 12000 ? t1.slice(0, 12000) : t1],
      to: localeTag,
    }

    let cancelled = false
    fetch('/api/translate/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((data: { translated?: unknown }) => {
        if (cancelled) return
        const tr = data.translated
        if (!Array.isArray(tr) || tr.length < 2) return
        const next0 = typeof tr[0] === 'string' && tr[0].trim() ? tr[0] : t0
        const next1 = typeof tr[1] === 'string' && tr[1].trim() ? tr[1] : t1
        clientCache.set(cacheKey, [next0, next1])
        setOut([next0, next1])
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [cacheKey, localeTag, t0, t1])

  return { title: out[0], description: out[1] }
}
