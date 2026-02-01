import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Force dynamic rendering since we use request.url
export const dynamic = 'force-dynamic'

// GET - Fetch all media with filtering
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') // VIDEO, IMAGE, MUSIC
    const sortParam = searchParams.get('sort') || 'popular'
    // Validate sort param - default to 'popular' if invalid
    const sort = ['popular', 'recent', 'rated'].includes(sortParam) ? sortParam : 'popular'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20))
    const search = searchParams.get('search')
    const user = searchParams.get('user') // Filter by username

    const skip = (page - 1) * limit
    
    console.log('Media API request:', { sort, page, limit, type, search, user })

    // Build where clause
    // Show all public, approved, non-deleted items
    // Sold items will be filtered out by cron job after 10 days
    const where: any = {
      isPublic: true,
      isApproved: true,
      isDeleted: false,
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
      // Check if searching for a hashtag
      if (search.startsWith('#')) {
        // Search for the hashtag in title and description
        // Also try hashtags field if it exists in DB
        const hashtag = search // Keep the # symbol for exact matching
        where.OR = [
          { title: { contains: hashtag, mode: 'insensitive' } },
          { description: { contains: hashtag, mode: 'insensitive' } },
        ]
      } else {
        // Regular search across title, description, and AI tool
      where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { aiTool: { contains: search, mode: 'insensitive' } },
      ]
      }
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

    // Fetch anonymous ratings for all media items in one query
    const mediaIds = media.map((m: any) => m.id)
    const anonymousRatings = await prisma.anonymousRating.findMany({
      where: { mediaId: { in: mediaIds } },
      select: { mediaId: true, score: true },
    })
    
    // Group anonymous ratings by mediaId
    const anonRatingsByMedia: Record<string, { happy: number; sad: number }> = {}
    for (const rating of anonymousRatings) {
      if (!anonRatingsByMedia[rating.mediaId]) {
        anonRatingsByMedia[rating.mediaId] = { happy: 0, sad: 0 }
      }
      if (rating.score === 3) anonRatingsByMedia[rating.mediaId].happy++
      if (rating.score === 1) anonRatingsByMedia[rating.mediaId].sad++
    }

    // Calculate average rating for each media and add sold info
    const now = new Date()
    const mediaWithRating = media.map((m: any) => {
      try {
        const avgRating =
          m.ratings && m.ratings.length > 0
            ? m.ratings.reduce((acc: number, r: any) => acc + (r.score || 0), 0) / m.ratings.length
            : 0
        
        // Calculate reaction counts (happy = score 3, sad = score 1) - include both user and anonymous ratings
        const userHappy = m.ratings ? m.ratings.filter((r: any) => r.score === 3).length : 0
        const userSad = m.ratings ? m.ratings.filter((r: any) => r.score === 1).length : 0
        const anonCounts = anonRatingsByMedia[m.id] || { happy: 0, sad: 0 }
        const happyCount = userHappy + anonCounts.happy
        const sadCount = userSad + anonCounts.sad
        
        // Calculate days remaining before deletion for sold items
        let daysRemaining = null
        if (m.isSold && m.deleteAfter) {
          const deleteDate = new Date(m.deleteAfter)
          const diffTime = deleteDate.getTime() - now.getTime()
          daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        }
        
        // Safely convert BigInt fields
        let fileSize = null
        if (m.fileSize !== null && m.fileSize !== undefined) {
          try {
            fileSize = typeof m.fileSize === 'bigint' ? m.fileSize.toString() : String(m.fileSize)
          } catch {
            fileSize = null
          }
        }
        
        return {
          ...m,
          fileSize,
          avgRating: Math.round(avgRating * 10) / 10,
          reactions: { happy: happyCount, sad: sadCount },
          ratings: undefined, // Remove individual ratings from response
          daysRemaining, // Days until removal (for sold items)
        }
      } catch (itemError) {
        console.error('Error processing media item:', m.id, itemError)
        // Return a minimal safe object
        return {
          id: m.id,
          title: m.title || 'Unknown',
          type: m.type || 'IMAGE',
          url: m.url || '',
          thumbnailUrl: m.thumbnailUrl || null,
          views: m.views || 0,
          createdAt: m.createdAt,
          user: m.user,
          avgRating: 0,
          reactions: { happy: 0, sad: 0 },
          fileSize: null,
        }
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
    // Return detailed error in development
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { 
        error: 'Failed to fetch media',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        media: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
      },
      { status: 500 }
    )
  }
}