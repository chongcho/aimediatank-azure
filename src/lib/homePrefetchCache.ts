/**
 * Cache for home feed data prefetched when user clicks Back on media detail (Option 1).
 * Media detail fetches home media before navigating; home page reads this and skips skeleton.
 */

export interface HomePrefetchParams {
  sort: string
  type: string | null
  search: string
  page: number
}

export interface HomePrefetchEntry {
  params: HomePrefetchParams
  media: unknown[]
  totalPages: number
}

let cache: HomePrefetchEntry | null = null

function buildKey(params: HomePrefetchParams): string {
  return `${params.sort}\n${params.type ?? ''}\n${params.search}\n${params.page}`
}

export function setHomePrefetch(entry: HomePrefetchEntry): void {
  cache = entry
}

export function getHomePrefetch(params: HomePrefetchParams): HomePrefetchEntry | null {
  if (!cache) return null
  if (buildKey(cache.params) !== buildKey(params)) return null
  const out = cache
  cache = null
  return out
}

export function clearHomePrefetch(): void {
  cache = null
}
