import { readFile } from 'fs/promises'
import { join } from 'path'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseMediaIdFromRouteParam } from '@/lib/mediaShareUrl'
import { optimizeSocialCardImage } from '@/lib/socialCardImage'
import {
  getCachedSocialCardImage,
  setCachedSocialCardImage,
  type CachedSocialCardImage,
} from '@/lib/socialCardImageCache'

async function resolvePublicImageUrl(mediaId: string): Promise<string | null> {
  const media = await prisma.media.findFirst({
    where: {
      id: mediaId,
      isPublic: true,
      isApproved: true,
      isDeleted: false,
    },
    select: {
      type: true,
      url: true,
      thumbnailUrl: true,
    },
  })

  if (!media) return null
  return media.thumbnailUrl || (media.type === 'IMAGE' ? media.url : null)
}

function toAbsolute(origin: string, url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('/')) return `${origin.replace(/\/$/, '')}${url}`
  return `${origin.replace(/\/$/, '')}/${url}`
}

let logoBytesPromise: Promise<Buffer> | null = null

function getLogoBytes(): Promise<Buffer> {
  if (!logoBytesPromise) {
    logoBytesPromise = readFile(join(process.cwd(), 'public', 'logo.png'))
  }
  return logoBytesPromise
}

const CARD_IMAGE_CACHE_CONTROL = 'public, max-age=86400, s-maxage=86400'

function finalizeCrawlerImageResponse(body: Buffer, contentType: string): NextResponse {
  const response = new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      'Cache-Control': CARD_IMAGE_CACHE_CONTROL,
    },
  })
  response.headers.delete('vary')
  return response
}

/** Always HTTP 200 — X and other crawlers do not follow redirects for card images. */
async function fallbackLogoResponse(): Promise<NextResponse> {
  const logo = await getLogoBytes()
  return finalizeCrawlerImageResponse(logo, 'image/png')
}

function imageResponse(image: CachedSocialCardImage): NextResponse {
  return finalizeCrawlerImageResponse(image.body, image.contentType)
}

const inFlight = new Map<string, Promise<CachedSocialCardImage | null>>()

async function renderSocialCardImage(
  mediaId: string,
  origin: string
): Promise<CachedSocialCardImage | null> {
  const cached = getCachedSocialCardImage(mediaId)
  if (cached) return cached

  let pending = inFlight.get(mediaId)
  if (!pending) {
    pending = (async () => {
      const source = await resolvePublicImageUrl(mediaId)
      if (!source) return null

      const absolute = toAbsolute(origin, source)
      const upstream = await fetch(absolute, { redirect: 'follow' })
      if (!upstream.ok) return null

      const raw = await upstream.arrayBuffer()
      const optimized = await optimizeSocialCardImage(
        raw,
        upstream.headers.get('content-type')
      )

      const image: CachedSocialCardImage = {
        body: optimized.body,
        contentType: optimized.contentType,
        cacheControl: optimized.cacheControl,
      }
      setCachedSocialCardImage(mediaId, image)
      return image
    })().finally(() => {
      inFlight.delete(mediaId)
    })
    inFlight.set(mediaId, pending)
  }

  return pending
}

/** Shared handler for public social-card image routes (not under /api — crawlers can fetch). */
export async function serveSocialCardImage(
  request: Request,
  rawMediaId: string
): Promise<NextResponse> {
  const origin = new URL(request.url).origin
  const mediaId = parseMediaIdFromRouteParam(rawMediaId)

  try {
    const image = await renderSocialCardImage(mediaId, origin)
    if (image) return imageResponse(image)
  } catch {
    // fall through to logo
  }

  return fallbackLogoResponse()
}
