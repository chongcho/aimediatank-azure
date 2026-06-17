import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { publicHomeFeedMediaReadyClause } from '@/lib/homeFeedVisibility'
import { selectVideoStreams } from '@/lib/videoStreamRenditions'

// Force dynamic rendering since we use request.url
export const dynamic = 'force-dynamic'

// GET - Fetch all media with filtering
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') // VIDEO, IMAGE, MUSIC
    const sortParam = searchParams.get('sort') || 'popular'
    // Validate sort param - default to 'popular' if invalid ('rated' kept for older clients)
    const normalizedSort = sortParam === 'rated' ? 'random' : sortParam
    const sort = ['popular', 'recent', 'random'].includes(normalizedSort) ? normalizedSort : 'popular'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20))
    const search = searchParams.get('search')
    const user = searchParams.get('user') // Filter by username
    const includeProcessing = searchParams.get('includeProcessing') === '1'

    const skip = (page - 1) * limit

    // When profile owner requests their own media with includeProcessing=1, include pending/processing/failed so they can see upload progress
    let allowProcessingStatuses = false
    if (user && includeProcessing) {
      const session = await getServerSession(authOptions)
      const requestedUser = decodeURIComponent(user)
      if (session?.user && typeof session.user === 'object' && 'username' in session.user) {
        const su = session.user as { username?: string; email?: string; id?: string }
        if (su.username === requestedUser || su.email === requestedUser) {
          allowProcessingStatuses = true
        }
      }
    }

    // Build where clause
    // Show all public, approved, non-deleted items. Include completed OR processing-with-preview (480p ready) so 480p shows on feed as soon as ready.
    const where: any = {
      isPublic: true,
      isApproved: true,
      isDeleted: false,
    }
    if (!allowProcessingStatuses) {
      where.AND = [publicHomeFeedMediaReadyClause]
    }

    // Exclude deactivated owners from all listings; filter by username when provided
    where.user = {
      accountDeactivatedAt: null,
      ...(user ? { username: decodeURIComponent(user) } : {}),
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

    // Build orderBy with stable tie-breaker (id) so pagination is consistent when createdAt/views are equal
    let orderBy: any = [{ views: 'desc' }, { id: 'desc' }] // popular
    if (sort === 'recent') {
      orderBy = [{ createdAt: 'desc' }, { id: 'desc' }]
    }

    // Load display streaming max once so we can set streamUrl for pre-play (homepage) to match Media Detail quality
    const cropSettings = await prisma.cropToolSetting.findFirst() as { freeStreamMaxHeight?: number } | null
    const freeStreamMaxHeight = cropSettings?.freeStreamMaxHeight ?? 720

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
          versions: {
            orderBy: { height: 'asc' },
            select: { height: true, url: true },
          },
          comments: {
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: {
              id: true,
              content: true,
              userId: true,
              user: { select: { username: true } },
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
        
        // For VIDEO, set streamUrl + optional streamRenditions (free-tier ladder for adaptive pre-play).
        let streamUrl: string | undefined
        let streamRenditions: { height: number; url: string }[] | undefined
        if (m.type === 'VIDEO' && m.url) {
          const versions = ((m as any).versions ?? []) as { height: number; url: string }[]
          const sel = selectVideoStreams({
            versions,
            mediaUrl: m.url,
            urlHq: (m as any).urlHq ?? null,
            isOwnerOrPurchased: false,
            paidQuality: 'hq',
            freeStreamMaxHeight,
          })
          streamUrl = sel.streamUrl ?? undefined
          if (sel.streamRenditions.length > 1) {
            streamRenditions = sel.streamRenditions
          }
        } else {
          streamUrl = m.url
        }

        const { versions: _v, comments: rawComments, ...rest } = m as any
        const commentsPreview = Array.isArray(rawComments)
          ? rawComments.map((c: { id: string; content: string; user?: { username?: string | null } }) => ({
              id: c.id,
              content: c.content,
              username: c.user?.username ?? null,
            }))
          : []
        return {
          ...rest,
          comments: commentsPreview,
          streamUrl,
          ...(streamRenditions && { streamRenditions }),
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
          streamUrl: m.type === 'VIDEO' ? m.url || '' : undefined,
          thumbnailUrl: m.thumbnailUrl || null,
          views: m.views || 0,
          createdAt: m.createdAt,
          user: m.user,
          avgRating: 0,
          reactions: { happy: 0, sad: 0 },
          fileSize: null,
          comments: [],
        }
      }
    })

    if (sort === 'random') {
      for (let i = mediaWithRating.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[mediaWithRating[i], mediaWithRating[j]] = [mediaWithRating[j], mediaWithRating[i]]
      }
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