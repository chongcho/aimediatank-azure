import { NextResponse } from 'next/server'
import { parseMediaIdFromRouteParam } from '@/lib/mediaShareUrl'
import { prisma } from '@/lib/prisma'
import { optimizeSocialCardImage } from '@/lib/socialCardImage'

export const dynamic = 'force-dynamic'

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

function redirectToLogo(request: Request) {
  const origin = new URL(request.url).origin
  return NextResponse.redirect(`${origin}/logo.png`, 302)
}

/**
 * Public social-card image — proxied with correct Content-Type and compressed for WhatsApp.
 */
export async function GET(
  request: Request,
  { params }: { params: { mediaId: string } }
) {
  const mediaId = parseMediaIdFromRouteParam(params.mediaId)
  const source = await resolvePublicImageUrl(mediaId)

  if (!source) {
    return redirectToLogo(request)
  }

  const absolute = toAbsolute(new URL(request.url).origin, source)

  try {
    const upstream = await fetch(absolute, { redirect: 'follow' })
    if (!upstream.ok) {
      return redirectToLogo(request)
    }

    const raw = await upstream.arrayBuffer()
    const optimized = await optimizeSocialCardImage(
      raw,
      upstream.headers.get('content-type')
    )

    return new NextResponse(new Uint8Array(optimized.body), {
      status: 200,
      headers: {
        'Content-Type': optimized.contentType,
        'Cache-Control': optimized.cacheControl,
      },
    })
  } catch {
    return redirectToLogo(request)
  }
}
