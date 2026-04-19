/**
 * In-memory cache for /api/media/[id]/play responses. Used so that when the user
 * clicks a media card (after hover or in-view prefetch), the media page can show
 * the player immediately without waiting for a network request.
 */

const TTL_MS = 60_000 // 1 minute
const MAX_ENTRIES = 50

interface Entry {
  data: unknown
  expiresAt: number
}

let cache: Map<string, Entry> = new Map()

function prune() {
  const now = Date.now()
  if (cache.size <= MAX_ENTRIES) return
  const entries = Array.from(cache.entries())
  for (let i = 0; i < entries.length; i++) {
    const [id, entry] = entries[i]
    if (entry.expiresAt <= now) cache.delete(id)
  }
  if (cache.size <= MAX_ENTRIES) return
  for (let i = 0; i < entries.length && cache.size > MAX_ENTRIES; i++) {
    cache.delete(entries[i][0])
  }
}

export function setMediaPlayCache(mediaId: string, data: unknown): void {
  if (!mediaId || !data) return
  cache.set(mediaId, { data, expiresAt: Date.now() + TTL_MS })
  prune()
}

export function getMediaPlayCache(mediaId: string): unknown | null {
  const entry = cache.get(mediaId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(mediaId)
    return null
  }
  return entry.data
}

export function prefetchMediaPlay(
  mediaId: string,
  onLoaded?: (data: { id: string; views?: number }) => void
): void {
  if (typeof window === 'undefined' || !mediaId) return
  const cached = getMediaPlayCache(mediaId)
  if (cached && typeof cached === 'object' && (cached as { id?: string }).id === mediaId) {
    const v = (cached as { views?: number }).views
    if (typeof v === 'number') onLoaded?.({ id: mediaId, views: v })
    return
  }
  fetch(`/api/media/${mediaId}/play?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data?.id === mediaId) {
        setMediaPlayCache(mediaId, data)
        const v = (data as { views?: number }).views
        if (typeof v === 'number') onLoaded?.({ id: mediaId, views: v })
      }
    })
    .catch(() => {})
}
