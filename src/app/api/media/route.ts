import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { publicHomeFeedMediaReadyClause } from '@/lib/homeFeedVisibility'
import { getBlockedUserIdsForViewer } from '@/lib/userBlocks'
import { getBlockedMediaIdsForViewer } from '@/lib/mediaBlocks'
import { selectVideoStreams } from '@/lib/videoStreamRenditions'

// Force dynamic rendering since we use request.url
export const dynamic = 'force-dynamic'

function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const swap = items[i]
    items[i] = items[j]
    items[j] = swap
  }
  return items
}

/**
 * Mix posts so neighboring items come from different post dates.
 * Days are shuffled, then one post is taken from each day in turn.
 */
function spreadIdsByPostDate(rows: { id: string; createdAt: Date }[], seed: string): string[] {
  if (rows.length <= 1) return rows.map((row) => row.id)
  // Same seed must always yield the same pages. Postgres does not guarantee
  // findMany order, and a later page would otherwise be a different mix.
  const stable = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const rng = mulberry32(hashSeed(seed))
  const buckets = new Map<string, string[]>()
  for (const row of stable) {
    const day = row.createdAt.toISOString().slice(0, 10)
    const list = buckets.get(day)
    if (list) list.push(row.id)
    else buckets.set(day, [row.id])
  }
  const days = seededShuffle(Array.from(buckets.keys()), rng)
  for (const day of days) seededShuffle(buckets.get(day)!, rng)
  const ordered: string[] = []
  let progressed = true
  while (progressed) {
    progressed = false
    for (const day of days) {
      const id = buckets.get(day)!.pop()
      if (!id) continue
      ordered.push(id)
      progressed = true
    }
  }
  return ordered
}

const randomOrderCache = new Map<string, { ids: string[]; expires: number }>()

function randomOrderCacheKey(parts: {
  seed: string
  viewerId: string
  type: string
  search: string
  user: string
  blockedUserIds: string[]
  blockedMediaIds: string[]
}): string {
  return JSON.stringify({
    ...parts,
    blockedUserIds: [...parts.blockedUserIds].sort(),
    blockedMediaIds: [...parts.blockedMediaIds].sort(),
  })
}

function readRandomOrder(key: string): string[] | null {
  const hit = randomOrderCache.get(key)
  if (!hit) return null
  if (hit.expires <= Date.now()) {
    randomOrderCache.delete(key)
    return null
  }
  return hit.ids
}

function storeRandomOrder(key: string, ids: string[]) {
  const now = Date.now()
  if (randomOrderCache.size > 100) {
    for (const entryKey of Array.from(randomOrderCache.keys())) {
      const entry = randomOrderCache.get(entryKey)
      if (entry && entry.expires <= now) randomOrderCache.delete(entryKey)
    }
  }
  if (randomOrderCache.size > 100) {
    const oldest = randomOrderCache.keys().next().value
    if (oldest) randomOrderCache.delete(oldest)
  }
  randomOrderCache.set(key, { ids, expires: now + 30 * 60 * 1000 })
}

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

    const session = await getServerSession(authOptions)
    const [blockedUserIds, blockedMediaIds] = await Promise.all([
      getBlockedUserIdsForViewer(session?.user?.id),
      getBlockedMediaIdsForViewer(session?.user?.id),
    ])

    // When profile owner requests their own media with includeProcessing=1, include pending/processing/failed so they can see upload progress
    let allowProcessingStatuses = false
    let viewingOwnProfile = false
    if (user && includeProcessing) {
      const requestedUser = decodeURIComponent(user)
      if (session?.user && typeof session.user === 'object' && 'username' in session.user) {
        const su = session.user as { username?: string; email?: string; id?: string }
        if (su.username === requestedUser || su.email === requestedUser) {
          allowProcessingStatuses = true
          viewingOwnProfile = true
        }
      }
    }

    // Build where clause
    // Show all public, approved, non-deleted items. Include completed OR processing-with-preview (480p ready) so 480p shows on feed as soon as ready.
    // Owner profile / TalkChat picker: include private uploads (e.g. chat attachments) but never the public home feed.
    const where: any = {
      isApproved: true,
      isDeleted: false,
      ...(viewingOwnProfile ? {} : { isPublic: true }),
      ...(blockedMediaIds.length > 0 && !viewingOwnProfile
        ? { id: { notIn: blockedMediaIds } }
        : {}),
    }
    if (!allowProcessingStatuses) {
      where.AND = [publicHomeFeedMediaReadyClause]
    }

    // Exclude deactivated owners from all listings; filter by username when provided
    where.user = {
      accountDeactivatedAt: null,
      ...(user ? { username: decodeURIComponent(user) } : {}),
      ...(blockedUserIds.length > 0 && !viewingOwnProfile
        ? { id: { notIn: blockedUserIds } }
        : {}),
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

    const mediaInclude = {
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
        orderBy: { height: 'asc' as const },
        select: { height: true, url: true },
      },
      comments: {
        orderBy: { createdAt: 'desc' as const },
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
    }

    let media: any[]
    let total: number
    if (sort === 'random') {
      const rawSeed = searchParams.get('seed') || ''
      const seed = /^[a-zA-Z0-9_-]{1,64}$/.test(rawSeed)
        ? rawSeed
        : new Date().toISOString().slice(0, 13)
      const orderKey = randomOrderCacheKey({
        seed,
        viewerId: session?.user?.id || '',
        type: type || '',
        search: search || '',
        user: user || '',
        blockedUserIds,
        blockedMediaIds,
      })
      let ordered = readRandomOrder(orderKey)
      if (!ordered) {
        const rows = await prisma.media.findMany({
          where,
          select: { id: true, createdAt: true },
          orderBy: { id: 'asc' },
        })
        ordered = spreadIdsByPostDate(rows, seed)
        storeRandomOrder(orderKey, ordered)
      }
      total = ordered.length
      const pageIds = ordered.slice(skip, skip + limit)
      const found = pageIds.length
        ? await prisma.media.findMany({
            where: { id: { in: pageIds } },
            include: mediaInclude,
          })
        : []
      const byId = new Map(found.map((item) => [item.id, item]))
      media = pageIds.map((id) => byId.get(id)).filter(Boolean)
    } else {
      const [pageMedia, count] = await Promise.all([
        prisma.media.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: mediaInclude,
        }),
        prisma.media.count({ where }),
      ])
      media = pageMedia
      total = count
    }

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