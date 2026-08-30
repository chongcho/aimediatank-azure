import {
  meetsDirectBlobOgThreshold,
  probeImageDimensionsFromUrl,
} from '@/lib/socialImageDimensions'
import {
  buildSocialCardImageUrl,
  SOCIAL_CARD_IMAGE_MAX_WIDTH,
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

/** OG image — native blob when ≥1200px wide; otherwise on-domain card-image (LinkedIn large cards). */
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
    if (dimensions && meetsDirectBlobOgThreshold(dimensions.width, dimensions.height)) {
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
