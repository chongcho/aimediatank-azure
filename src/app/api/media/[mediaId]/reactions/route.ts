import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Map reaction types to score values
const reactionToScore: Record<string, number> = {
  happy: 3,
  neutral: 2,
  sad: 1,
}

const scoreToReaction: Record<number, 'happy' | 'neutral' | 'sad'> = {
  3: 'happy',
  2: 'neutral',
  1: 'sad',
}

// GET - Get reaction counts and user's reaction
export async function GET(
  request: NextRequest,
  { params }: { params: { mediaId: string } }
) {
  try {
    const { mediaId } = params
    const session = await getServerSession(authOptions)

    // Get all ratings for this media
    const ratings = await prisma.rating.findMany({
      where: { mediaId },
      select: { score: true, userId: true },
    })

    // Count reactions
    const counts = {
      happy: ratings.filter(r => r.score === 3).length,
      neutral: ratings.filter(r => r.score === 2).length,
      sad: ratings.filter(r => r.score === 1).length,
    }

    // Get user's reaction if logged in
    let userReaction: 'happy' | 'neutral' | 'sad' | null = null
    if (session?.user?.id) {
      const userRating = ratings.find(r => r.userId === session.user.id)
      if (userRating && userRating.score >= 1 && userRating.score <= 3) {
        userReaction = scoreToReaction[userRating.score]
      }
    }

    return NextResponse.json({ counts, userReaction })
  } catch (error) {
    console.error('Error fetching reactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reactions' },
      { status: 500 }
    )
  }
}

// POST - Set or update user's reaction
export async function POST(
  request: NextRequest,
  { params }: { params: { mediaId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { mediaId } = params
    const { type } = await request.json()

    if (!['happy', 'neutral', 'sad'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid reaction type' },
        { status: 400 }
      )
    }

    const score = reactionToScore[type]

    // Check if user already has a reaction
    const existingRating = await prisma.rating.findUnique({
      where: {
        userId_mediaId: {
          userId: session.user.id,
          mediaId,
        },
      },
    })

    if (existingRating) {
      // If clicking same reaction, remove it
      if (existingRating.score === score) {
        await prisma.rating.delete({
          where: { id: existingRating.id },
        })
      } else {
        // Update to new reaction
        await prisma.rating.update({
          where: { id: existingRating.id },
          data: { score },
        })
      }
    } else {
      // Create new reaction
      await prisma.rating.create({
        data: {
          userId: session.user.id,
          mediaId,
          score,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error setting reaction:', error)
    return NextResponse.json(
      { error: 'Failed to set reaction' },
      { status: 500 }
    )
  }
}

