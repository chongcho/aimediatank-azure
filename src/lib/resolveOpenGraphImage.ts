import {
  meetsSocialPreviewMinimum,
  probeImageDimensionsFromUrl,
} from '@/lib/socialImageDimensions'
import {
  buildSocialCardImageUrl,
  SOCIAL_CARD_IMAGE_HEIGHT,
  SOCIAL_CARD_IMAGE_MAX_WIDTH,
  SOCIAL_CARD_IMAGE_WIDTH,
  type SocialPreviewImage,
} from '@/lib/socialCardMeta'

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

export function dimensionsAfterCardScale(
  sourceWidth: number,
  sourceHeight: number
): { width: number; height: number } {
  return {
    width: SOCIAL_CARD_IMAGE_MAX_WIDTH,
    height: Math.max(1, Math.round((sourceHeight * SOCIAL_CARD_IMAGE_MAX_WIDTH) / sourceWidth)),
  }
}

/** LinkedIn/Facebook OG — always 1200×630 landscape card (portrait blobs → small side thumbnail). */
export function resolveOpenGraphImageUrl(
  media: { id: string },
  baseUrl: string
): SocialPreviewImage {
  return {
    url: buildSocialCardImageUrl(baseUrl, media.id),
    width: SOCIAL_CARD_IMAGE_WIDTH,
    height: SOCIAL_CARD_IMAGE_HEIGHT,
    type: 'image/jpeg',
    isCardImage: true,
  }
}

/** X/Twitter — native aspect from blob when large enough; else scaled card dimensions. */
export async function resolveTwitterImageUrl(
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
    width: SOCIAL_CARD_IMAGE_WIDTH,
    height: SOCIAL_CARD_IMAGE_HEIGHT,
  }
  if (dimensions) {
    const scaled = dimensionsAfterCardScale(dimensions.width, dimensions.height)
    cardPreview.width = scaled.width
    cardPreview.height = scaled.height
  }
  return cardPreview
}
