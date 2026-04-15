import { NextResponse } from 'next/server'
import {
  cleanTitle,
  getBaseUrl,
  getPublicMediaForMeta,
  toAbsoluteUrl,
} from '@/lib/publicMediaMeta'

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const FRAME_ANCESTORS =
  "'self' https://twitter.com https://mobile.twitter.com https://x.com https://www.x.com https://platform.twitter.com https://cards-dev.twitter.com"

export async function GET(
  _request: Request,
  { params }: { params: { mediaId: string } }
) {
  const media = await getPublicMediaForMeta(params.mediaId)
  const baseUrl = getBaseUrl()

  if (!media || media.type !== 'VIDEO') {
    const body = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Unavailable</title></head><body style="margin:0;background:#111;color:#888;font:14px system-ui;display:flex;align-items:center;justify-content:center;height:100vh">Media unavailable</body></html>`
    return new NextResponse(body, {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `frame-ancestors ${FRAME_ANCESTORS}`,
        'Cache-Control': 'public, max-age=300',
      },
    })
  }

  const title = escapeHtml(cleanTitle(media.title))
  const videoUrl = toAbsoluteUrl(baseUrl, media.url)
  const posterUrl =
    toAbsoluteUrl(baseUrl, media.thumbnailUrl) ||
    toAbsoluteUrl(baseUrl, media.url) ||
    `${baseUrl}/logo.png`

  if (!videoUrl) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const safeVideo = escapeHtml(videoUrl)
  const safePoster = escapeHtml(posterUrl)

  const body = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
html,body{margin:0;height:100%;background:#000}
video{display:block;width:100%;height:100%;object-fit:contain;box-sizing:border-box}
</style>
</head>
<body>
<video src="${safeVideo}" poster="${safePoster}" autoplay muted playsinline loop controls></video>
</body>
</html>`

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `frame-ancestors ${FRAME_ANCESTORS}`,
      'Cache-Control': 'public, max-age=300',
    },
  })
}
