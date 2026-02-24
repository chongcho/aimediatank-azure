import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/media/[mediaId]/view
 * Increment view count (e.g. when pre-played on homepage for 10+ seconds or full cycle).
 * Only allowed for public, approved, non-deleted media.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true, isPublic: true, isApproved: true, isDeleted: true },
    })
    if (!media || !media.isPublic || !media.isApproved || media.isDeleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await prisma.media.update({
      where: { id: mediaId },
      data: { views: { increment: 1 } },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[media view increment]', e)
    return NextResponse.json({ error: 'Failed to record view' }, { status: 500 })
  }
}
