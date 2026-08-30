/** Standard Open Graph link-preview size (1.91:1 — WhatsApp large card). */
export const SOCIAL_CARD_IMAGE_WIDTH = 1200
export const SOCIAL_CARD_IMAGE_HEIGHT = 630

/** Twitter / OG card description limit (Twitter truncates around 200 chars). */
export const SOCIAL_CARD_DESCRIPTION_MAX = 200

/** Bump when card-image output changes so WhatsApp re-fetches cached previews. */
export const SOCIAL_CARD_IMAGE_CACHE_VERSION = '7'

export function truncateForSocialCard(text: string, max = SOCIAL_CARD_DESCRIPTION_MAX): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

/** Stable on-domain image URL for social crawlers (under /media so robots.txt allows fetch). */
export function buildSocialCardImageUrl(baseUrl: string, mediaId: string): string {
  const root = baseUrl.replace(/\/$/, '')
  return `${root}/media/${mediaId}/card-image?v=${SOCIAL_CARD_IMAGE_CACHE_VERSION}`
}

export type SocialPreviewImage = {
  url: string
  width?: number
  height?: number
  type?: string
  /** Letterboxed on-domain card-image — not a direct blob URL. */
  isCardImage: boolean
}

/** Prefer Azure blob thumbnails for OG/X (clean CDN headers); fall back to on-domain card-image. */
export function resolveOpenGraphImageUrl(
  media: {
    id: string
    type: string
    url: string | null
    thumbnailUrl: string | null
  },
  baseUrl: string
): SocialPreviewImage {
  const blob =
    (media.thumbnailUrl?.startsWith('https://') && media.thumbnailUrl) ||
    (media.type === 'IMAGE' && media.url?.startsWith('https://') ? media.url : null)

  if (blob) {
    const lower = blob.toLowerCase()
    const type = lower.includes('.png') ? 'image/png' : 'image/jpeg'
    return { url: blob, type, isCardImage: false }
  }

  return {
    url: buildSocialCardImageUrl(baseUrl, media.id),
    width: SOCIAL_CARD_IMAGE_WIDTH,
    height: SOCIAL_CARD_IMAGE_HEIGHT,
    type: 'image/jpeg',
    isCardImage: true,
  }
}
