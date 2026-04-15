import type { Metadata } from 'next'
import MediaPageClient from './MediaPageClient'
import {
  cleanTitle,
  getBaseUrl,
  getPublicMediaForMeta,
  toAbsoluteUrl,
} from '@/lib/publicMediaMeta'

export async function generateMetadata({
  params,
}: {
  params: { mediaId: string }
}): Promise<Metadata> {
  const baseUrl = getBaseUrl()
  const media = await getPublicMediaForMeta(params.mediaId)

  if (!media) {
    return {
      title: 'Media Not Found | AI Media Tank (AiM)',
      description: 'This media item is not available.',
      robots: { index: false, follow: false },
    }
  }

  const title = cleanTitle(media.title)
  const description = media.description?.trim() || `Explore ${title} on AI Media Tank (AiM).`
  const canonical = `${baseUrl}/media/${media.id}`
  const contentUrl = toAbsoluteUrl(baseUrl, media.url)
  const thumbnailUrl =
    toAbsoluteUrl(baseUrl, media.thumbnailUrl) ||
    toAbsoluteUrl(baseUrl, media.type === 'IMAGE' ? media.url : null) ||
    `${baseUrl}/logo.png`
  const keywords = Array.from(
    new Set(
      ['AI media', 'AI Media Tank (AiM)', media.type?.toLowerCase(), media.aiTool, media.realDevice].filter(
        (value): value is string => Boolean(value && value.trim())
      )
    )
  )

  const isVideo = media.type === 'VIDEO' && Boolean(contentUrl)
  const twitterPlayerUrl = `${baseUrl}/embed/twitter/${media.id}`

  return {
    title: `${title} | AI Media Tank (AiM)`,
    description,
    keywords,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'AI Media Tank, LLC (AiM)',
      type:
        media.type === 'VIDEO'
          ? 'video.other'
          : media.type === 'MUSIC'
            ? 'music.song'
            : 'article',
      images: [
        {
          url: thumbnailUrl,
        },
      ],
      videos:
        media.type === 'VIDEO' && contentUrl
          ? [
              {
                url: contentUrl,
              },
            ]
          : undefined,
    },
    twitter: isVideo
      ? {
          card: 'player',
          title,
          description,
          images: [thumbnailUrl],
          players: {
            playerUrl: twitterPlayerUrl,
            streamUrl: contentUrl!,
            width: 1280,
            height: 720,
          },
        }
      : {
          card: 'summary_large_image',
          title,
          description,
          images: [thumbnailUrl],
        },
  }
}

export default async function MediaPage({
  params,
}: {
  params: { mediaId: string }
}) {
  const baseUrl = getBaseUrl()
  const media = await getPublicMediaForMeta(params.mediaId)

  const jsonLd =
    media &&
    (() => {
      const title = cleanTitle(media.title)
      const description = media.description?.trim() || `Explore ${title} on AI Media Tank (AiM).`
      const contentUrl = toAbsoluteUrl(baseUrl, media.url)
      const thumbnailUrl =
        toAbsoluteUrl(baseUrl, media.thumbnailUrl) ||
        toAbsoluteUrl(baseUrl, media.type === 'IMAGE' ? media.url : null)
      const keywords = Array.from(
        new Set(
          ['AI media', 'AI Media Tank (AiM)', media.type?.toLowerCase(), media.aiTool, media.realDevice].filter(
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
        isFamilyFriendly: media.ageRestriction !== '18+',
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
      <MediaPageClient mediaId={params.mediaId} />
    </div>
  )
}
