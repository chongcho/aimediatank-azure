/**
 * In-memory snapshot of the home feed, saved by the home page when data loads.
 * On back-navigation the home page reads this synchronously in useState
 * so it renders content on the very first frame (no skeleton flash).
 *
 * Module-level variable survives SPA navigations (router.push / router.back).
 */

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

let snapshot: Snapshot | null = null

export function saveHomeFeed(params: HomeFeedParams, media: unknown[], totalPages: number): void {
  snapshot = { params, media, totalPages }
}

export function getHomeFeed(params: HomeFeedParams): Snapshot | null {
  if (!snapshot) return null
  const s = snapshot.params
  if (s.sort !== params.sort || s.type !== params.type || s.search !== params.search) return null
  if (s.page < params.page) return null
  return snapshot
}

export function clearHomeFeed(): void {
  snapshot = null
}
