/**
 * Keeps homepage view badges aligned with server counts across prefetch, preplay,
 * and navigation to/from the media detail page (sessionStorage + optional event).
 */

export const MEDIA_VIEWS_UPDATED_EVENT = 'mediaViewsUpdated'

export type MediaViewsUpdatedDetail = { mediaId: string; views: number }

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

export function setStoredMediaViews(mediaId: string, views: number): void {
  if (typeof window === 'undefined' || !mediaId) return
  try {
    sessionStorage.setItem(storageKey(mediaId), String(views))
  } catch {
    /* quota / private mode */
  }
}

/** Prefer feed value and any newer value we stored from detail/prefetch/preplay. */
export function resolveDisplayViews(mediaId: string, feedViews: number): number {
  if (typeof window === 'undefined') return feedViews
  const stored = getStoredMediaViews(mediaId)
  return Math.max(feedViews, stored ?? 0)
}

export function broadcastMediaViewsUpdated(detail: MediaViewsUpdatedDetail): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(MEDIA_VIEWS_UPDATED_EVENT, { detail }))
  } catch {
    /* ignore */
  }
}
