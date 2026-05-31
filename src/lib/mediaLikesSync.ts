/**
 * Keeps the "thumbs up" (happy reaction) count + the current viewer's liked
 * state aligned across the homepage feed cards and the media detail page/modal
 * without refetching the feed.
 *
 * Unlike view counts (monotonic, see mediaViewsSync), likes can go up AND down
 * (toggle/unlike), so we need exact sync rather than a max merge. A single
 * window event per like click is fine here because likes are user-driven and
 * infrequent (no per-scroll churn).
 */

export interface MediaLikeState {
  /** Total thumbs-up count. */
  happy: number
  /** Whether the current user/visitor has liked this media. */
  liked: boolean
}

const EVENT = 'media-likes-sync'
const memory = new Map<string, MediaLikeState>()

function storageKey(mediaId: string): string {
  return `mediaLikes:${mediaId}`
}

/** Stable per-browser id so anonymous likes can be toggled. Shared with the detail page. */
export function getVisitorId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    let visitorId = localStorage.getItem('visitorId')
    if (!visitorId) {
      visitorId = 'anon_' + Math.random().toString(36).substring(2) + Date.now().toString(36)
      localStorage.setItem('visitorId', visitorId)
    }
    return visitorId
  } catch {
    return null
  }
}

export function getStoredLikes(mediaId: string): MediaLikeState | null {
  if (!mediaId) return null
  if (memory.has(mediaId)) return memory.get(mediaId)!
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(storageKey(mediaId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as MediaLikeState
    if (parsed && typeof parsed.happy === 'number') {
      memory.set(mediaId, parsed)
      return parsed
    }
  } catch {
    /* ignore quota / parse errors */
  }
  return null
}

/** Initial display value: prefer anything we already know client-side over the feed value. */
export function resolveDisplayLikes(mediaId: string, feedHappy: number): MediaLikeState {
  const stored = getStoredLikes(mediaId)
  if (stored) return stored
  return { happy: Math.max(0, feedHappy || 0), liked: false }
}

/** Persist + broadcast the authoritative like state for a media id. */
export function publishLikes(mediaId: string, state: MediaLikeState): void {
  if (typeof window === 'undefined' || !mediaId) return
  const next: MediaLikeState = { happy: Math.max(0, state.happy || 0), liked: !!state.liked }
  memory.set(mediaId, next)
  try {
    sessionStorage.setItem(storageKey(mediaId), JSON.stringify(next))
  } catch {
    /* quota / private mode */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { mediaId, state: next } }))
}

/** Subscribe to like updates. Returns an unsubscribe function. */
export function subscribeLikes(
  cb: (mediaId: string, state: MediaLikeState) => void
): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ mediaId: string; state: MediaLikeState }>).detail
    if (detail && detail.mediaId) cb(detail.mediaId, detail.state)
  }
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
