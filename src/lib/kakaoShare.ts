import {
  buildSocialCardImageUrl,
  SOCIAL_CARD_IMAGE_HEIGHT,
  SOCIAL_CARD_IMAGE_WIDTH,
} from '@/lib/socialCardMeta'

export const KAKAO_SHARE_TEXT_MAX = 200
const KAKAO_TITLE_MAX = 80

/** HTTPS image Kakao's scraper can fetch — prefer on-domain card-image over blob thumbnails. */
export function resolveKakaoShareImageUrl(
  shareUrl: string,
  mediaId: string,
  thumbnailUrl?: string | null
): string | undefined {
  try {
    const origin = new URL(shareUrl).origin
    if (origin.startsWith('https://')) {
      return buildSocialCardImageUrl(origin, mediaId)
    }
  } catch {
    // ignore invalid shareUrl
  }
  return thumbnailUrl?.startsWith('https://') ? thumbnailUrl : undefined
}

export function buildKakaoSharePayload(
  title: string,
  message: string,
  shareUrl: string,
  imageUrl: string | undefined,
  fallbackTitle: string
) {
  const trimmedTitle = title.trim() || fallbackTitle
  const trimmedMessage = message.trim() || trimmedTitle
  const link = { mobileWebUrl: shareUrl, webUrl: shareUrl }
  const combined =
    trimmedMessage !== trimmedTitle && trimmedTitle
      ? `${trimmedTitle}\n\n${trimmedMessage}`
      : trimmedMessage || trimmedTitle
  const text = combined.slice(0, KAKAO_SHARE_TEXT_MAX)

  if (imageUrl) {
    return {
      objectType: 'feed' as const,
      content: {
        title: trimmedTitle.slice(0, KAKAO_TITLE_MAX),
        description: trimmedMessage.slice(0, KAKAO_SHARE_TEXT_MAX),
        imageUrl,
        imageWidth: SOCIAL_CARD_IMAGE_WIDTH,
        imageHeight: SOCIAL_CARD_IMAGE_HEIGHT,
        link,
      },
    }
  }

  return {
    objectType: 'text' as const,
    text,
    link,
  }
}
