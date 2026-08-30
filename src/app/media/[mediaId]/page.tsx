import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { parseMediaIdFromRouteParam } from '@/lib/mediaShareUrl'
import {
  resolveOpenGraphImageUrl,
  truncateForSocialCard,
} from '@/lib/socialCardMeta'
import MediaPageClient from './MediaPageClient'

const getBaseUrl = () => {
  const host = headers().get('host')
  if (!host) return 'https://aimediatank.com'
  return host.includes('localhost') ? `http://${host}` : `https://${host}`
}

const cleanTitle = (title: string) => title.replace(/#\w+/g, '').trim()

const toAbsoluteUrl = (baseUrl: string, url: string | null) => {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  if (url.startsWith('/')) {
    return `${baseUrl}${url}`
  }
  return `${baseUrl}/${url}`
}

const getMediaForMeta = async (mediaId: string) => {
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
      aiTool: true,
      realDevice: true,
      createdAt: true,
      updatedAt: true,
      price: true,
      isSold: true,
      ageRestriction: true,
      user: {
        select: {
          username: true,
          name: true,
        },
      },
    },
  })
}

export async function generateMetadata({
  params,
}: {
  params: { mediaId: string }
}): Promise<Metadata> {
  const baseUrl = getBaseUrl()
  const mediaId = parseMediaIdFromRouteParam(params.mediaId)
  const media = await getMediaForMeta(mediaId)

  if (!media) {
    return {
      title: 'Media Not Found | AI Media Tank (AMT)',
      description: 'This media item is not available.',
      robots: { index: false, follow: false },
    }
  }

  const title = cleanTitle(media.title)
  const description = media.description?.trim() || `Explore ${title} on AI Media Tank (AMT).`
  const socialDescription = truncateForSocialCard(description)
  const canonical = `${baseUrl}/media/${media.id}`
  const previewImage = await resolveOpenGraphImageUrl(media, baseUrl)
  const keywords = Array.from(
    new Set(
      ['AI media', 'AI Media Tank (AMT)', media.type?.toLowerCase(), media.aiTool, media.realDevice].filter(
        (value): value is string => Boolean(value && value.trim())
      )
    )
  )

  return {
    title: `${title} | AI Media Tank (AMT)`,
    description: socialDescription,
    keywords,
    alternates: { canonical },
    openGraph: {
      title,
      description: socialDescription,
      url: canonical,
      siteName: 'AI Media Tank, LLC (AMT)',
      type: media.type === 'MUSIC' ? 'music.song' : 'article',
      images: [
        {
          url: previewImage.url,
          alt: title,
          ...(previewImage.width && previewImage.height
            ? {
                width: previewImage.width,
                height: previewImage.height,
                type: (previewImage.type ?? 'image/jpeg') as 'image/jpeg' | 'image/png',
              }
            : previewImage.type
              ? { type: previewImage.type as 'image/jpeg' | 'image/png' }
              : {}),
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: socialDescription,
      images: [
        {
          url: previewImage.url,
          alt: title,
          ...(previewImage.width && previewImage.height
            ? {
                width: previewImage.width,
                height: previewImage.height,
              }
            : {}),
        },
      ],
    },
  }
}

export default async function MediaPage({
  params,
}: {
  params: { mediaId: string }
}) {
  const baseUrl = getBaseUrl()
  const mediaId = parseMediaIdFromRouteParam(params.mediaId)
  const media = await getMediaForMeta(mediaId)

  const jsonLd =
    media &&
    (() => {
      const title = cleanTitle(media.title)
      const description = media.description?.trim() || `Explore ${title} on AI Media Tank (AMT).`
      const contentUrl = toAbsoluteUrl(baseUrl, media.url)
      const thumbnailUrl =
        toAbsoluteUrl(baseUrl, media.thumbnailUrl) ||
        toAbsoluteUrl(baseUrl, media.type === 'IMAGE' ? media.url : null)
      const keywords = Array.from(
        new Set(
          ['AI media', 'AI Media Tank (AMT)', media.type?.toLowerCase(), media.aiTool, media.realDevice].filter(
            (value): value is string => Boolean(value && value.trim())
          )
        )
      )

      const schemaType =
        media.type === 'VIDEO'
          ? 'VideoObject'
          : media.type === 'MUSIC'
            ? 'AudioObject'
            : 'ImageObject'

      const authorName = media.user.name || media.user.username

      return {
        '@context': 'https://schema.org',
        '@type': schemaType,
        name: title,
        description,
        uploadDate: media.createdAt.toISOString(),
        dateModified: media.updatedAt.toISOString(),
        contentUrl,
        thumbnailUrl: thumbnailUrl ? [thumbnailUrl] : undefined,
        keywords,
        author: {
          '@type': 'Person',
          name: authorName,
        },
        isFamilyFriendly: media.ageRestriction !== '16+' && media.ageRestriction !== '18+',
        offers:
          media.price && media.price > 0
            ? {
                '@type': 'Offer',
                priceCurrency: 'USD',
                price: media.price.toFixed(2),
                availability: 'https://schema.org/InStock',
              }
            : undefined,
      }
    })()

  return (
    <div data-initial-content>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <MediaPageClient mediaId={mediaId} />
    </div>
  )
}

