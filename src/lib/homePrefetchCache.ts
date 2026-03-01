/**
 * Persists a snapshot of the home feed to sessionStorage.
 * On back-navigation the home page reads this synchronously in useState
 * so it renders content on the very first frame (no skeleton flash).
 *
 * Uses sessionStorage for durability (survives chunk unload during SPA nav)
 * plus a volatile window flag so the cache auto-invalidates on page reload.
 */

const STORAGE_KEY = 'homeFeedSnapshot'

export interface HomeFeedParams {
  sort: string
  type: string | null
  search: string
  page: number
}

interface Snapshot {
  params: HomeFeedParams
  media: unknown[]
  totalPages: number
}

export function saveHomeFeed(params: HomeFeedParams, media: unknown[], totalPages: number): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ params, media, totalPages }))
    if (typeof window !== 'undefined') (window as any).__homeFeedCacheValid = true
  } catch { /* quota exceeded or private mode */ }
}

export function getHomeFeed(params: HomeFeedParams): Snapshot | null {
  try {
    if (typeof window === 'undefined' || !(window as any).__homeFeedCacheValid) return null
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const snap = JSON.parse(raw) as Snapshot
    const s = snap.params
    if (s.sort !== params.sort || s.type !== params.type || s.search !== params.search) return null
    if (s.page < params.page) return null
    return snap
  } catch { return null }
}

export function clearHomeFeed(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
    if (typeof window !== 'undefined') (window as any).__homeFeedCacheValid = false
  } catch {}
}
