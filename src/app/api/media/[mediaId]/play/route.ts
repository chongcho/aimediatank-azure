import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Minimal "play" endpoint: returns only what's needed to render the player and
 * start video load. No comments, no ratings. View count is incremented in the
 * background after sending the response. Use this for the first request on the
 * media page; then fetch full GET /api/media/[id]?skipView=1 for comments/ratings.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params

    const [session, media] = await Promise.all([
      getServerSession(authOptions),
      prisma.media.findUnique({
        where: { id: mediaId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              avatar: true,
              bio: true,
            },
          },
          versions: {
            orderBy: { height: 'asc' as const },
            select: { url: true, height: true },
          },
        },
      }),
    ])

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }
    if (media.isDeleted) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    let streamUrl: string | null = null
    if (media.type === 'VIDEO' && media.url) {
      const [purchase, cropSettings] = await Promise.all([
        session?.user
          ? prisma.purchase.findFirst({
              where: { mediaId, buyerId: session.user.id, status: 'completed' },
            })
          : Promise.resolve(null),
        prisma.cropToolSetting.findFirst(),
      ])
      const isOwner = media.userId === session?.user?.id
      const hasPurchased = !!purchase
      const freeStreamMaxHeight = (cropSettings as { freeStreamMaxHeight?: number } | null)?.freeStreamMaxHeight ?? 720
      const paidQuality = (cropSettings as { paidDownloadQuality?: string } | null)?.paidDownloadQuality ?? 'hq'
      const versions = (media as { versions: Array<{ url: string; height: number }> }).versions ?? []

      if (isOwner || hasPurchased) {
        if (paidQuality === 'hq') {
          const bestVersion = versions[versions.length - 1]
          streamUrl = (media as { urlHq?: string | null }).urlHq ?? bestVersion?.url ?? media.url
        } else if (paidQuality === '1080p') {
          const v = versions.find((v) => v.height === 1080)
          streamUrl = v?.url ?? (media as { urlHq?: string | null }).urlHq ?? media.url
        } else {
          const v = versions.find((v) => v.height === 720)
          streamUrl = v?.url ?? media.url
        }
      } else {
        const cap = Math.max(480, freeStreamMaxHeight)
        const best = [...versions].filter((v) => v.height <= cap).pop()
        streamUrl = best?.url ?? media.url
      }
    }

    const fileSize =
      (media as { fileSize?: number | null }).fileSize == null
        ? null
        : String((media as { fileSize: number }).fileSize)

    const payload = {
      id: media.id,
      title: media.title,
      description: media.description,
      type: media.type,
      url: media.url,
      urlHq: (media as { urlHq?: string | null }).urlHq ?? null,
      thumbnailUrl: media.thumbnailUrl,
      aiTool: media.aiTool,
      aiPrompt: media.aiPrompt,
      views: media.views + 1,
      avgRating: 0,
      createdAt: media.createdAt,
      price: media.price,
      processingStatus: media.processingStatus,
      processingError: (media as { processingError?: string | null }).processingError ?? null,
      user: media.user,
      comments: [],
      ratings: [],
      _count: { comments: 0, ratings: 0 },
      fileSize,
      ...(streamUrl && { streamUrl }),
    }

    const res = NextResponse.json(payload)
    // Increment view count in background so response is sent first
    prisma.media
      .update({
        where: { id: mediaId },
        data: { views: { increment: 1 } },
      })
      .catch((e) => console.error('[media/play] view increment failed:', e))
    return res
  } catch (error) {
    console.error('Error fetching media play:', error)
    return NextResponse.json(
      { error: 'Failed to fetch media' },
      { status: 500 }
    )
  }
}
