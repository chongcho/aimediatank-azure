import { NextResponse } from 'next/server'
import {
  buildMediaOgPreviewHtml,
  buildMediaSocialPreview,
  getPublicMediaForSocialPreview,
} from '@/lib/mediaSocialPreview'

export const dynamic = 'force-dynamic'

function baseUrlFromRequest(request: Request): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!host) return 'https://aimediatank.com'
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  return host.includes('localhost') ? `http://${host}` : `${proto}://${host}`
}

/** Minimal OG HTML for link-preview crawlers (WhatsApp Web, Facebook, etc.). */
export async function GET(
  request: Request,
  { params }: { params: { mediaId: string } }
) {
  const media = await getPublicMediaForSocialPreview(params.mediaId)
  if (!media) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const preview = buildMediaSocialPreview(media, baseUrlFromRequest(request))
  const html = buildMediaOgPreviewHtml(preview)

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
