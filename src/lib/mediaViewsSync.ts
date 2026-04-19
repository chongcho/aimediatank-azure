/**
 * Monotonic view counts in sessionStorage so homepage badges stay aligned with
 * detail/prefetch/preplay without refetching the feed. No window events (avoids
 * O(n) work per homepage card on each update).
 */

function storageKey(mediaId: string): string {
  return `mediaViews:${mediaId}`
}

export function getStoredMediaViews(mediaId: string): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(storageKey(mediaId))
    if (raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function setStoredMediaViews(mediaId: string, views: number): void {
  if (typeof window === 'undefined' || !mediaId) return
  try {
    sessionStorage.setItem(storageKey(mediaId), String(views))
  } catch {
    /* quota / private mode */
  }
}

/** Never decrease sessionStorage for a media id. */
export function mergeStoredMediaViews(mediaId: string, candidate: number): number {
  if (!Number.isFinite(candidate)) return getStoredMediaViews(mediaId) ?? 0
  const stored = getStoredMediaViews(mediaId) ?? 0
  const next = Math.max(stored, candidate)
  setStoredMediaViews(mediaId, next)
  return next
}

/** Initial / feed sync: max of API list value and anything we stored client-side. */
export function resolveDisplayViews(mediaId: string, feedViews: number): number {
  if (typeof window === 'undefined') return feedViews
  const stored = getStoredMediaViews(mediaId)
  return Math.max(feedViews, stored ?? 0)
}
