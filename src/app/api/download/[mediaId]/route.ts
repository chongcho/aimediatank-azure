import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Download purchased media
export async function GET(
  request: Request,
  { params }: { params: { mediaId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const mediaId = params.mediaId

    // Check if user has purchased this media
    const purchase = await prisma.purchase.findFirst({
      where: {
        mediaId,
        buyerId: session.user.id,
        status: 'completed',
      },
    })

    // Get the media
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    // Allow download if user purchased it OR if they're the owner OR if it's free
    const isOwner = media.userId === session.user.id
    const isFree = !media.price || media.price === 0
    const hasPurchased = !!purchase

    if (!isOwner && !isFree && !hasPurchased) {
      return NextResponse.json(
        { error: 'You must purchase this content to download it' },
        { status: 403 }
      )
    }

    // If this is a paid purchase (not owner, not free), mark as sold
    if (hasPurchased && !isOwner && !(media as any).isSold) {
      const deleteAfterDate = new Date()
      deleteAfterDate.setDate(deleteAfterDate.getDate() + 10) // 10 days from now

      await prisma.media.update({
        where: { id: mediaId },
        data: {
          isSold: true,
          soldAt: new Date(),
          deleteAfter: deleteAfterDate,
          isPublic: false, // Hide from public listings
        },
      })
    }

    // Redirect to the actual file URL for download
    return NextResponse.redirect(media.url)
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json(
      { error: 'Failed to process download' },
      { status: 500 }
    )
  }
}






