import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST - Add or update rating
export async function POST(
  request: Request,
  { params }: { params: { mediaId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { score, review } = await request.json()

    if (!score || score < 1 || score > 5) {
      return NextResponse.json(
        { error: 'Score must be between 1 and 5' },
        { status: 400 }
      )
    }

    // Check if media exists
    const media = await prisma.media.findUnique({
      where: { id: params.mediaId },
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    // Can't rate your own media
    if (media.userId === session.user.id) {
      return NextResponse.json(
        { error: "You can't rate your own media" },
        { status: 400 }
      )
    }

    // Upsert rating (create or update)
    const rating = await prisma.rating.upsert({
      where: {
        userId_mediaId: {
          userId: session.user.id,
          mediaId: params.mediaId,
        },
      },
      update: {
        score,
        review: review || null,
      },
      create: {
        score,
        review: review || null,
        userId: session.user.id,
        mediaId: params.mediaId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
          },
        },
      },
    })

    // Get updated average rating
    const ratings = await prisma.rating.findMany({
      where: { mediaId: params.mediaId },
      select: { score: true },
    })

    const avgRating =
      ratings.reduce((acc, r) => acc + r.score, 0) / ratings.length

    return NextResponse.json({
      rating,
      avgRating: Math.round(avgRating * 10) / 10,
      totalRatings: ratings.length,
    })
  } catch (error) {
    console.error('Error rating media:', error)
    return NextResponse.json(
      { error: 'Failed to rate media' },
      { status: 500 }
    )
  }
}

// GET - Get user's rating for media
export async function GET(
  request: Request,
  { params }: { params: { mediaId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ rating: null })
    }

    const rating = await prisma.rating.findUnique({
      where: {
        userId_mediaId: {
          userId: session.user.id,
          mediaId: params.mediaId,
        },
      },
    })

    return NextResponse.json({ rating })
  } catch (error) {
    console.error('Error fetching rating:', error)
    return NextResponse.json(
      { error: 'Failed to fetch rating' },
      { status: 500 }
    )
  }
}


