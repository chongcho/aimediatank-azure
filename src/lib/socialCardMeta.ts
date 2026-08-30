/** Standard max width for OG link-preview images (height follows aspect ratio). */
export const SOCIAL_CARD_IMAGE_MAX_WIDTH = 1200

/** Legacy 1.91:1 target — used only where a fixed box is required (e.g. Kakao). */
export const SOCIAL_CARD_IMAGE_WIDTH = 1200
export const SOCIAL_CARD_IMAGE_HEIGHT = 630

/** Twitter / OG card description limit (Twitter truncates around 200 chars). */
export const SOCIAL_CARD_DESCRIPTION_MAX = 200

/** Bump when card-image output changes so WhatsApp re-fetches cached previews. */
export const SOCIAL_CARD_IMAGE_CACHE_VERSION = '9'

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
  /** On-domain card-image (scaled, aspect preserved) vs direct blob URL. */
  isCardImage: boolean
}

/** Sync helper when dimensions are already known (card-image handler). */
export function buildCardImagePreview(
  baseUrl: string,
  mediaId: string,
  width: number,
  height: number
): SocialPreviewImage {
  return {
    url: buildSocialCardImageUrl(baseUrl, mediaId),
    width,
    height,
    type: 'image/jpeg',
    isCardImage: true,
  }
}
