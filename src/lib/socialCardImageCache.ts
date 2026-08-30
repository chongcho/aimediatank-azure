import { SOCIAL_CARD_IMAGE_CACHE_VERSION } from '@/lib/socialCardMeta'

const TTL_MS = 86_400_000 // 24h — matches Cache-Control on card-image responses
const MAX_ENTRIES = 200

export interface CachedSocialCardImage {
  body: Buffer
  contentType: string
  cacheControl: string
}

interface Entry {
  image: CachedSocialCardImage
  expiresAt: number
}

const cache = new Map<string, Entry>()

function cacheKey(mediaId: string): string {
  return `${SOCIAL_CARD_IMAGE_CACHE_VERSION}:${mediaId}`
}

function prune(now = Date.now()) {
  for (const [key, entry] of Array.from(cache.entries())) {
    if (entry.expiresAt <= now) cache.delete(key)
  }
  if (cache.size <= MAX_ENTRIES) return
  const oldest = Array.from(cache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt)
  for (const [key] of oldest) {
    if (cache.size <= MAX_ENTRIES) break
    cache.delete(key)
  }
}

export function getCachedSocialCardImage(mediaId: string): CachedSocialCardImage | null {
  const entry = cache.get(cacheKey(mediaId))
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey(mediaId))
    return null
  }
  return entry.image
}

export function setCachedSocialCardImage(mediaId: string, image: CachedSocialCardImage): void {
  cache.set(cacheKey(mediaId), { image, expiresAt: Date.now() + TTL_MS })
  prune()
}
