import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { socialMediaForbiddenResponse } from '@/lib/socialAgeGate'

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

// GET - Get reaction counts and user's/visitor's reaction
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params
    const session = await getServerSession(authOptions)
    const visitorId = request.headers.get('x-visitor-id')

    // Get all ratings from signed-in users
    const userRatings = await prisma.rating.findMany({
      where: { mediaId },
      select: { score: true, userId: true },
    })

    // Get all anonymous ratings
    const anonymousRatings = await prisma.anonymousRating.findMany({
      where: { mediaId },
      select: { score: true, visitorId: true },
    })

    // Count reactions from both sources
    const counts = {
      happy: userRatings.filter(r => r.score === 3).length + anonymousRatings.filter(r => r.score === 3).length,
      neutral: userRatings.filter(r => r.score === 2).length + anonymousRatings.filter(r => r.score === 2).length,
      sad: userRatings.filter(r => r.score === 1).length + anonymousRatings.filter(r => r.score === 1).length,
    }

    // Get user's reaction if logged in
    let userReaction: 'happy' | 'neutral' | 'sad' | null = null
    if (session?.user?.id) {
      const userRating = userRatings.find(r => r.userId === session.user.id)
      if (userRating && userRating.score >= 1 && userRating.score <= 3) {
        userReaction = scoreToReaction[userRating.score]
      }
    } else if (visitorId) {
      // Check anonymous reaction
      const anonRating = anonymousRatings.find(r => r.visitorId === visitorId)
      if (anonRating && anonRating.score >= 1 && anonRating.score <= 3) {
        userReaction = scoreToReaction[anonRating.score]
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

// POST - Set or update user's/visitor's reaction
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params
    const session = await getServerSession(authOptions)
    const { type, visitorId } = await request.json()

    if (!['happy', 'neutral', 'sad'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid reaction type' },
        { status: 400 }
      )
    }

    const score = reactionToScore[type]

    if (session?.user?.id) {
      const ageBlock = await socialMediaForbiddenResponse(session.user.id)
      if (ageBlock) return ageBlock

      // Signed-in user - use Rating table
      const existingRating = await prisma.rating.findUnique({
        where: {
          userId_mediaId: {
            userId: session.user.id,
            mediaId,
          },
        },
      })

      if (existingRating) {
        if (existingRating.score === score) {
          // Clicking same reaction removes it
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
    } else if (visitorId) {
      // Anonymous user - use AnonymousRating table
      const existingRating = await prisma.anonymousRating.findUnique({
        where: {
          visitorId_mediaId: {
            visitorId,
            mediaId,
          },
        },
      })

      if (existingRating) {
        if (existingRating.score === score) {
          // Clicking same reaction removes it
          await prisma.anonymousRating.delete({
            where: { id: existingRating.id },
          })
        } else {
          // Update to new reaction
          await prisma.anonymousRating.update({
            where: { id: existingRating.id },
            data: { score },
          })
        }
      } else {
        // Create new reaction
        await prisma.anonymousRating.create({
          data: {
            visitorId,
            mediaId,
            score,
          },
        })
      }
    } else {
      return NextResponse.json(
        { error: 'Visitor ID required for anonymous reactions' },
        { status: 400 }
      )
    }

    // Recompute authoritative counts + the viewer's resulting reaction so callers
    // (homepage card + detail page) can sync without a second request.
    const [userRatings, anonymousRatings] = await Promise.all([
      prisma.rating.findMany({ where: { mediaId }, select: { score: true, userId: true } }),
      prisma.anonymousRating.findMany({ where: { mediaId }, select: { score: true, visitorId: true } }),
    ])

    const counts = {
      happy: userRatings.filter(r => r.score === 3).length + anonymousRatings.filter(r => r.score === 3).length,
      neutral: userRatings.filter(r => r.score === 2).length + anonymousRatings.filter(r => r.score === 2).length,
      sad: userRatings.filter(r => r.score === 1).length + anonymousRatings.filter(r => r.score === 1).length,
    }

    let userReaction: 'happy' | 'neutral' | 'sad' | null = null
    if (session?.user?.id) {
      const userRating = userRatings.find(r => r.userId === session.user.id)
      if (userRating && userRating.score >= 1 && userRating.score <= 3) {
        userReaction = scoreToReaction[userRating.score]
      }
    } else if (visitorId) {
      const anonRating = anonymousRatings.find(r => r.visitorId === visitorId)
      if (anonRating && anonRating.score >= 1 && anonRating.score <= 3) {
        userReaction = scoreToReaction[anonRating.score]
      }
    }

    return NextResponse.json({ success: true, counts, userReaction })
  } catch (error) {
    console.error('Error setting reaction:', error)
    return NextResponse.json(
      { error: 'Failed to set reaction' },
      { status: 500 }
    )
  }
}
