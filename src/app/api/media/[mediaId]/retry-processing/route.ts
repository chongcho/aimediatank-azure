import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/media/[mediaId]/retry-processing
 * Reset failed video processing to pending so the cron picks it up again.
 * Owner or admin only; only allowed when processingStatus === 'failed'.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { mediaId } = await params
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      select: {
        id: true,
        userId: true,
        type: true,
        processingStatus: true,
        isDeleted: true,
      },
    })

    if (!media || media.isDeleted) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    const isOwner = media.userId === session.user.id
    const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (media.processingStatus !== 'failed') {
      return NextResponse.json(
        { error: 'Can only retry when processing has failed' },
        { status: 400 }
      )
    }

    if (media.type !== 'VIDEO') {
      return NextResponse.json(
        { error: 'Only video processing can be retried' },
        { status: 400 }
      )
    }

    await prisma.media.update({
      where: { id: mediaId },
      data: {
        processingStatus: 'pending',
        processingError: null,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[retry-processing]', e)
    return NextResponse.json(
      { error: 'Failed to retry processing' },
      { status: 500 }
    )
  }
}
