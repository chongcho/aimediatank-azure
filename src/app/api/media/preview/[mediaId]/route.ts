import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: { mediaId: string } }
) {
  try {
    const media = await prisma.media.findUnique({
      where: { id: params.mediaId },
      select: {
        id: true,
        title: true,
        type: true,
        url: true,
        thumbnailUrl: true,
        isPublic: true,
        isApproved: true,
        isDeleted: true,
        userId: true,
      },
    })

    if (!media || media.isDeleted) {
      // Return 404 so the client can mark it as "missing" without leaking existence.
      return NextResponse.json({ missing: true }, { status: 404 })
    }

    // Public + approved media is previewable without auth.
    if (media.isPublic && media.isApproved) {
      return NextResponse.json({
        id: media.id,
        title: media.title,
        url: media.url,
        thumbnailUrl: media.thumbnailUrl,
        type: media.type,
      })
    }

    // Otherwise, only preview if the signed-in user can access it (owner/admin/purchased/saved).
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ missing: true }, { status: 404 })
    }

    if (session.user.role === 'ADMIN' || session.user.id === media.userId) {
      return NextResponse.json({
        id: media.id,
        title: media.title,
        url: media.url,
        thumbnailUrl: media.thumbnailUrl,
        type: media.type,
      })
    }

    const [purchase, saved] = await Promise.all([
      prisma.purchase.findFirst({
        where: {
          buyerId: session.user.id,
          mediaId: media.id,
          status: 'completed',
        },
        select: { id: true },
      }),
      prisma.savedMedia.findFirst({
        where: {
          userId: session.user.id,
          mediaId: media.id,
        },
        select: { id: true },
      }),
    ])

    if (!purchase && !saved) {
      return NextResponse.json({ missing: true }, { status: 404 })
    }

    return NextResponse.json({
      id: media.id,
      title: media.title,
      url: media.url,
      thumbnailUrl: media.thumbnailUrl,
      type: media.type,
    })
  } catch (error) {
    console.error('Error fetching media preview:', error)
    return NextResponse.json({ error: 'Failed to fetch media preview' }, { status: 500 })
  }
}
