/** Shared client cache for `/api/ui/badges` (MediaCard, Navbar feed translate, etc.). */

export type FeedBadgeItem = { itemKey: string; isEnabled: boolean }

export type FeedBadgePayload = {
  items: FeedBadgeItem[]
  homePreplaySound: boolean
  autoTranslation: boolean
}

let badgePayloadCache: FeedBadgePayload | null = null
let badgePayloadPromise: Promise<FeedBadgePayload | null> | null = null

export function resetFeedBadgePayloadCache() {
  badgePayloadCache = null
  badgePayloadPromise = null
}

export async function fetchFeedBadgePayload(): Promise<FeedBadgePayload | null> {
  if (badgePayloadCache) return badgePayloadCache
  if (badgePayloadPromise) return badgePayloadPromise

  badgePayloadPromise = (async () => {
    try {
      const res = await fetch(`/api/ui/badges?_=${Date.now()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!res.ok) return null
      const data = await res.json()
      const items = (data.items || []) as FeedBadgeItem[]
      const homePreplaySound = data.homePreplaySound !== false
      const autoTranslation = data.autoTranslation !== false
      const payload: FeedBadgePayload = { items, homePreplaySound, autoTranslation }
      badgePayloadCache = payload
      return payload
    } catch (error) {
      console.error('Error fetching badge settings:', error)
      return null
    } finally {
      badgePayloadPromise = null
    }
  })()

  return badgePayloadPromise
}

export async function getFeedBadgeItems(): Promise<FeedBadgeItem[] | null> {
  const p = await fetchFeedBadgePayload()
  return p?.items ?? null
}

/** Synchronous read of last fetched payload (null before first fetch completes). */
export function getFeedBadgePayloadSync(): FeedBadgePayload | null {
  return badgePayloadCache
}
