import {
  meetsSocialPreviewMinimum,
  probeImageDimensionsFromUrl,
} from '@/lib/socialImageDimensions'

/** Standard max width for OG link-preview images (height follows aspect ratio). */
export const SOCIAL_CARD_IMAGE_MAX_WIDTH = 1200

/** Legacy 1.91:1 target — used only where a fixed box is required (e.g. Kakao). */
export const SOCIAL_CARD_IMAGE_WIDTH = 1200
export const SOCIAL_CARD_IMAGE_HEIGHT = 630

/** Twitter / OG card description limit (Twitter truncates around 200 chars). */
export const SOCIAL_CARD_DESCRIPTION_MAX = 200

/** Bump when card-image output changes so WhatsApp re-fetches cached previews. */
export const SOCIAL_CARD_IMAGE_CACHE_VERSION = '8'

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

function blobMimeType(url: string): string {
  const lower = url.toLowerCase()
  if (lower.includes('.png')) return 'image/png'
  if (lower.includes('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function resolveBlobSource(media: {
  type: string
  url: string | null
  thumbnailUrl: string | null
}): string | null {
  if (media.thumbnailUrl?.startsWith('https://')) return media.thumbnailUrl
  if (media.type === 'IMAGE' && media.url?.startsWith('https://')) return media.url
  return null
}

/** Expected card-image output size after scale-to-1200 (for OG meta when blob is too small). */
export function dimensionsAfterCardScale(
  sourceWidth: number,
  sourceHeight: number
): { width: number; height: number } {
  return {
    width: SOCIAL_CARD_IMAGE_MAX_WIDTH,
    height: Math.max(1, Math.round((sourceHeight * SOCIAL_CARD_IMAGE_MAX_WIDTH) / sourceWidth)),
  }
}

export async function resolveOpenGraphImageUrl(
  media: {
    id: string
    type: string
    url: string | null
    thumbnailUrl: string | null
  },
  baseUrl: string
): Promise<SocialPreviewImage> {
  const blob = resolveBlobSource(media)
  let dimensions: { width: number; height: number } | null = null
  if (blob) {
    dimensions = await probeImageDimensionsFromUrl(blob)
    if (dimensions && meetsSocialPreviewMinimum(dimensions.width, dimensions.height)) {
      return {
        url: blob,
        width: dimensions.width,
        height: dimensions.height,
        type: blobMimeType(blob),
        isCardImage: false,
      }
    }
  }

  const cardPreview: SocialPreviewImage = {
    url: buildSocialCardImageUrl(baseUrl, media.id),
    type: 'image/jpeg',
    isCardImage: true,
  }
  if (dimensions) {
    const scaled = dimensionsAfterCardScale(dimensions.width, dimensions.height)
    cardPreview.width = scaled.width
    cardPreview.height = scaled.height
  }
  return cardPreview
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
