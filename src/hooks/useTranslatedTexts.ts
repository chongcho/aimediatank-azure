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
const clientListCache = new Map<string, string[]>()

const LIST_CHUNK = 28

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

    const to = String(localeTag ?? 'en')
    const body = {
      texts: [t0, t1.length > 12000 ? t1.slice(0, 12000) : t1],
      to,
    }

    let cancelled = false
    fetch('/api/translate/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        if (cancelled || !r.ok) return null
        return r.json() as Promise<{ translated?: unknown }>
      })
      .then((data: { translated?: unknown } | null) => {
        if (cancelled || !data) return
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

/**
 * Translates a fixed list of UI strings via `/api/translate/text` in chunks.
 * For English UI tags, returns originals synchronously. Preserves length and order.
 */
export function useTranslatedList(
  originals: readonly string[],
  localeTag: string | undefined,
  enabled = true
): string[] {
  const primary = (localeTag || 'en').toLowerCase().split('-')[0]
  const fingerprint = useMemo(() => originals.join('\u0001'), [originals])

  const [out, setOut] = useState<string[]>(() => [...originals])

  useEffect(() => {
    setOut([...originals])
  }, [fingerprint, originals, primary, localeTag])

  const cacheKey = useMemo(() => {
    if (!enabled || originals.length === 0) return ''
    if (primary === 'en') return ''
    return `${localeTag || 'en'}::list::${fnv1a(fingerprint)}`
  }, [enabled, localeTag, fingerprint, originals.length, primary])

  useEffect(() => {
    if (!cacheKey || primary === 'en') return

    const cached = clientListCache.get(cacheKey)
    if (cached && cached.length === originals.length) {
      setOut(cached)
      return
    }

    const to = String(localeTag ?? 'en')
    let cancelled = false

    ;(async () => {
      const merged: string[] = [...originals]
      for (let i = 0; i < originals.length; i += LIST_CHUNK) {
        const slice = originals.slice(i, i + LIST_CHUNK)
        try {
          const r = await fetch('/api/translate/text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts: slice, to }),
          })
          if (cancelled || !r.ok) continue
          const data = (await r.json()) as { translated?: unknown }
          const tr = data.translated
          if (!Array.isArray(tr) || tr.length !== slice.length) continue
          for (let j = 0; j < slice.length; j++) {
            const s = typeof tr[j] === 'string' && tr[j].trim() ? tr[j] : slice[j]
            merged[i + j] = s
          }
        } catch {
          /* keep originals for this chunk */
        }
      }
      if (cancelled) return
      clientListCache.set(cacheKey, merged)
      setOut(merged)
    })()

    return () => {
      cancelled = true
    }
  }, [cacheKey, localeTag, originals, primary, fingerprint])

  if (!enabled || primary === 'en') return [...originals]
  return out.length === originals.length ? out : [...originals]
}
