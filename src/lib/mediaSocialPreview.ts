import { prisma } from '@/lib/prisma'
import { parseMediaIdFromRouteParam } from '@/lib/mediaShareUrl'
import {
  resolveOpenGraphImageUrl,
  SOCIAL_CARD_IMAGE_HEIGHT,
  SOCIAL_CARD_IMAGE_WIDTH,
  truncateForSocialCard,
} from '@/lib/socialCardMeta'

const cleanTitle = (title: string) => title.replace(/#\w+/g, '').trim()

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function getPublicMediaForSocialPreview(rawMediaId: string) {
  const mediaId = parseMediaIdFromRouteParam(rawMediaId)
  return prisma.media.findFirst({
    where: {
      id: mediaId,
      isPublic: true,
      isApproved: true,
      isDeleted: false,
    },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      url: true,
      thumbnailUrl: true,
    },
  })
}

export function buildMediaSocialPreview(
  media: {
    id: string
    title: string
    description: string | null
    type: string
    url: string | null
    thumbnailUrl: string | null
  },
  baseUrl: string
) {
  const title = cleanTitle(media.title)
  const description = media.description?.trim() || `Explore ${title} on AI Media Tank (AMT).`
  const socialDescription = truncateForSocialCard(description)
  const canonical = `${baseUrl.replace(/\/$/, '')}/media/${media.id}`
  const previewImage = resolveOpenGraphImageUrl(media, baseUrl)
  const ogType = media.type === 'MUSIC' ? 'music.song' : 'article'

  return { title, socialDescription, canonical, previewImage, ogType }
}

/** Minimal HTML so WhatsApp Web / Meta crawlers see OG tags in the first KB of the response. */
export function buildMediaOgPreviewHtml(
  preview: ReturnType<typeof buildMediaSocialPreview>
): string {
  const title = escapeHtml(preview.title)
  const description = escapeHtml(preview.socialDescription)
  const canonical = escapeHtml(preview.canonical)
  const image = escapeHtml(preview.previewImage.url)
  const imageType = escapeHtml(preview.previewImage.type ?? 'image/jpeg')
  const dimensionTags = preview.previewImage.isCardImage
    ? `<meta property="og:image:width" content="${SOCIAL_CARD_IMAGE_WIDTH}"/>
<meta property="og:image:height" content="${SOCIAL_CARD_IMAGE_HEIGHT}"/>
<meta name="twitter:image:width" content="${SOCIAL_CARD_IMAGE_WIDTH}"/>
<meta name="twitter:image:height" content="${SOCIAL_CARD_IMAGE_HEIGHT}"/>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${description}"/>
<meta property="og:url" content="${canonical}"/>
<meta property="og:site_name" content="AI Media Tank, LLC (AMT)"/>
<meta property="og:type" content="${preview.ogType}"/>
<meta property="og:image" content="${image}"/>
<meta property="og:image:secure_url" content="${image}"/>
${dimensionTags}
<meta property="og:image:type" content="${imageType}"/>
<meta property="og:image:alt" content="${title}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${description}"/>
<meta name="twitter:image" content="${image}"/>
<title>${title} | AI Media Tank (AMT)</title>
<link rel="canonical" href="${canonical}"/>
</head>
<body><p><a href="${canonical}">${title}</a></p></body>
</html>`
}
