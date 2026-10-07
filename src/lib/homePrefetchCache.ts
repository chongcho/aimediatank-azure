/**
 * Persists a snapshot of the home feed to sessionStorage.
 * On back-navigation the home page reads this synchronously in useState
 * so it renders content on the very first frame (no skeleton flash).
 *
 * Uses sessionStorage for durability (survives chunk unload during SPA nav)
 * plus a volatile window flag so the cache auto-invalidates on page reload.
 */

const STORAGE_KEY = 'homeFeedSnapshot'
const RANDOM_SEED_KEY = 'homeRandomSeed'

export function readHomeRandomSeed(): string {
  try {
    return sessionStorage.getItem(RANDOM_SEED_KEY) || ''
  } catch {
    return ''
  }
}

export function writeHomeRandomSeed(seed: string): void {
  if (!seed) return
  try {
    sessionStorage.setItem(RANDOM_SEED_KEY, seed)
  } catch {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
      sessionStorage.setItem(RANDOM_SEED_KEY, seed)
    } catch { /* private mode */ }
  }
}

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
    const json = JSON.stringify({ params, media, totalPages })
    // A deep scroll must not fill the quota; scroll restore and the Random seed are tiny keys.
    if (json.length > 1_500_000) {
      sessionStorage.removeItem(STORAGE_KEY)
      if (typeof window !== 'undefined') (window as any).__homeFeedCacheValid = false
      return
    }
    sessionStorage.setItem(STORAGE_KEY, json)
    if (typeof window !== 'undefined') (window as any).__homeFeedCacheValid = true
  } catch {
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* private mode */ }
    if (typeof window !== 'undefined') (window as any).__homeFeedCacheValid = false
  }
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
