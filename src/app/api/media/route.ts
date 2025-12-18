import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Force dynamic rendering since we use request.url
export const dynamic = 'force-dynamic'

// GET - Fetch all media with filtering
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') // VIDEO, IMAGE, MUSIC
    const sort = searchParams.get('sort') || 'popular' // popular, recent, rated
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search')
    const user = searchParams.get('user') // Filter by username

    const skip = (page - 1) * limit

    // Build where clause
    // Show all public, approved items
    // Sold items will be filtered out by cron job after 10 days
    const where: any = {
      isPublic: true,
      isApproved: true,
    }

    // Filter by username if provided
    if (user) {
      where.user = {
        username: user,
      }
    }

    if (type && ['VIDEO', 'IMAGE', 'MUSIC'].includes(type)) {
      where.type = type
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { aiTool: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Build orderBy
    let orderBy: any = { views: 'desc' } // popular
    if (sort === 'recent') {
      orderBy = { createdAt: 'desc' }
    }

    const [media, total] = await Promise.all([
      prisma.media.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              avatar: true,
            },
          },
          ratings: {
            select: {
              score: true,
            },
          },
          _count: {
            select: {
              comments: true,
              ratings: true,
            },
          },
        },
      }),
      prisma.media.count({ where }),
    ])

    // Calculate average rating for each media and add sold info
    const now = new Date()
    const mediaWithRating = media.map((m: any) => {
      const avgRating =
        m.ratings.length > 0
          ? m.ratings.reduce((acc: number, r: any) => acc + r.score, 0) / m.ratings.length
          : 0
      
      // Calculate days remaining before deletion for sold items
      let daysRemaining = null
      if (m.isSold && m.deleteAfter) {
        const deleteDate = new Date(m.deleteAfter)
        const diffTime = deleteDate.getTime() - now.getTime()
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      }
      
      return {
        ...m,
        avgRating: Math.round(avgRating * 10) / 10,
        ratings: undefined, // Remove individual ratings from response
        daysRemaining, // Days until removal (for sold items)
      }
    })

    // Sort by rating if requested
    if (sort === 'rated') {
      mediaWithRating.sort((a, b) => b.avgRating - a.avgRating)
    }

    return NextResponse.json({
      media: mediaWithRating,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching media:', error)
    return NextResponse.json(
      { error: 'Failed to fetch media' },
      { status: 500 }
    )
  }
}
