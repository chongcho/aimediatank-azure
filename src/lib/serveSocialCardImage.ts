import { readFile } from 'fs/promises'
import { join } from 'path'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseMediaIdFromRouteParam } from '@/lib/mediaShareUrl'
import { optimizeSocialCardImage } from '@/lib/socialCardImage'

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

async function fallbackLogoResponse(origin: string): Promise<NextResponse> {
  try {
    const logo = await readFile(join(process.cwd(), 'public', 'logo.png'))
    return new NextResponse(new Uint8Array(logo), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(logo.length),
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    })
  } catch {
    return NextResponse.redirect(`${origin}/logo.png`, 302)
  }
}

function imageResponse(body: Buffer, contentType: string, cacheControl: string): NextResponse {
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      'Cache-Control': cacheControl,
    },
  })
}

/** Shared handler for public social-card image routes (not under /api — crawlers can fetch). */
export async function serveSocialCardImage(
  request: Request,
  rawMediaId: string
): Promise<NextResponse> {
  const origin = new URL(request.url).origin
  const mediaId = parseMediaIdFromRouteParam(rawMediaId)
  const source = await resolvePublicImageUrl(mediaId)

  if (!source) {
    return fallbackLogoResponse(origin)
  }

  const absolute = toAbsolute(origin, source)

  try {
    const upstream = await fetch(absolute, { redirect: 'follow' })
    if (!upstream.ok) {
      return fallbackLogoResponse(origin)
    }

    const raw = await upstream.arrayBuffer()
    const optimized = await optimizeSocialCardImage(
      raw,
      upstream.headers.get('content-type')
    )

    return imageResponse(optimized.body, optimized.contentType, optimized.cacheControl)
  } catch {
    return fallbackLogoResponse(origin)
  }
}
