import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Fetch user's saved media
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all saved media for this user
    const savedItems = await prisma.savedMedia.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        media: {
          select: {
            id: true,
            title: true,
            type: true,
            url: true,
            thumbnailUrl: true,
            price: true,
            views: true,
            aiTool: true,
            createdAt: true,
            user: {
              select: {
                username: true,
                name: true,
                avatar: true,
              },
            },
            _count: {
              select: {
                comments: true,
                ratings: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Filter out any items where media might have been deleted
    const validSaved = savedItems.filter(item => item.media !== null)

    return NextResponse.json({
      saved: validSaved,
    })
  } catch (error) {
    console.error('Error fetching saved media:', error)
    return NextResponse.json(
      { error: 'Failed to fetch saved media' },
      { status: 500 }
    )
  }
}






