import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type Preview = {
  id: string
  title: string
  url: string
  thumbnailUrl: string | null
  type: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null
    const ids = Array.isArray(body?.ids) ? body!.ids : []
    const cleaned = Array.from(
      new Set(ids.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((s) => s.trim()))
    ).slice(0, 50)

    if (cleaned.length === 0) {
      return NextResponse.json({ previews: [], missing: [] })
    }

    const media = await prisma.media.findMany({
      where: {
        id: { in: cleaned },
        isDeleted: false,
        user: { accountDeactivatedAt: null },
      },
      select: {
        id: true,
        title: true,
        type: true,
        url: true,
        thumbnailUrl: true,
        isPublic: true,
        isApproved: true,
        userId: true,
      },
    })

    const byId = new Map(media.map((m) => [m.id, m]))

    const publicApproved: Preview[] = []
    const needsAuthIds: string[] = []

    for (const id of cleaned) {
      const m = byId.get(id)
      if (!m) continue
      if (m.isPublic && m.isApproved) {
        publicApproved.push({
          id: m.id,
          title: m.title,
          url: m.url,
          thumbnailUrl: m.thumbnailUrl,
          type: m.type,
        })
      } else {
        needsAuthIds.push(id)
      }
    }

    if (needsAuthIds.length === 0) {
      const missing = cleaned.filter((id) => !byId.has(id))
      return NextResponse.json({ previews: publicApproved, missing })
    }

    const session = await getServerSession(authOptions)
    const user = session?.user
    if (!user) {
      // For non-public media, do not reveal existence when unauthenticated.
      const missing = cleaned.filter((id) => !publicApproved.some((p) => p.id === id))
      return NextResponse.json({ previews: publicApproved, missing })
    }

    // Admin can preview all non-deleted media.
    if (user.role === 'ADMIN') {
      const all: Preview[] = media.map((m) => ({
        id: m.id,
        title: m.title,
        url: m.url,
        thumbnailUrl: m.thumbnailUrl,
        type: m.type,
      }))
      const missing = cleaned.filter((id) => !byId.has(id))
      return NextResponse.json({ previews: all, missing })
    }

    const [purchases, saved] = await Promise.all([
      prisma.purchase.findMany({
        where: { buyerId: user.id, mediaId: { in: needsAuthIds }, status: 'completed' },
        select: { mediaId: true },
      }),
      prisma.savedMedia.findMany({
        where: { userId: user.id, mediaId: { in: needsAuthIds } },
        select: { mediaId: true },
      }),
    ])

    const purchasedSet = new Set(purchases.map((p) => p.mediaId))
    const savedSet = new Set(saved.map((s) => s.mediaId))

    const previews: Preview[] = [...publicApproved]
    for (const id of needsAuthIds) {
      const m = byId.get(id)
      if (!m) continue
      if (m.userId === user.id || purchasedSet.has(id) || savedSet.has(id)) {
        previews.push({
          id: m.id,
          title: m.title,
          url: m.url,
          thumbnailUrl: m.thumbnailUrl,
          type: m.type,
        })
      }
    }

    const previewed = new Set(previews.map((p) => p.id))
    const missing = cleaned.filter((id) => !previewed.has(id))

    return NextResponse.json({ previews, missing })
  } catch (error) {
    console.error('Error fetching media previews:', error)
    return NextResponse.json({ error: 'Failed to fetch media previews' }, { status: 500 })
  }
}

