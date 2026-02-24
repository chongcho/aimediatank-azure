import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { unlink } from 'fs/promises'
import { join } from 'path'

// Force dynamic rendering to always get fresh data
export const dynamic = 'force-dynamic'

// GET - Fetch single media with details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
            bio: true,
          },
        },
        comments: {
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
          orderBy: { createdAt: 'desc' },
        },
        ratings: {
          select: {
            score: true,
            review: true,
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
        _count: {
          select: {
            comments: true,
            ratings: true,
          },
        },
        versions: {
          orderBy: { height: 'asc' },
        },
      } as any,
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    // Check if media is deleted (soft delete) - return 404 for regular users
    if (media.isDeleted) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    // Increment view count
    await prisma.media.update({
      where: { id: mediaId },
      data: { views: { increment: 1 } },
    })

    // Calculate average rating
    const ratings = (media as any).ratings || []
    const avgRating =
      ratings.length > 0
        ? ratings.reduce((acc: number, r: any) => acc + r.score, 0) / ratings.length
        : 0

    // Resolve stream URL for video from admin download/stream settings
    let streamUrl: string | null = null
    if (media.type === 'VIDEO' && media.url) {
      const session = await getServerSession(authOptions)
      const purchase = session?.user
        ? await prisma.purchase.findFirst({
            where: { mediaId, buyerId: session.user.id, status: 'completed' },
          })
        : null
      const isOwner = media.userId === session?.user?.id
      const hasPurchased = !!purchase
      const cropSettings = await prisma.cropToolSetting.findFirst() as { freeStreamMaxHeight?: number; paidDownloadQuality?: string } | null
      const freeStreamMaxHeight = cropSettings?.freeStreamMaxHeight ?? 720
      const paidQuality = cropSettings?.paidDownloadQuality ?? 'hq'
      const versions = (media as any).versions || []

      if (isOwner || hasPurchased) {
        if (paidQuality === 'hq') {
          // Prefer urlHq when present; otherwise use best available version (versions ordered by height asc)
          const bestVersion = versions[versions.length - 1]
          streamUrl = (media as any).urlHq ?? bestVersion?.url ?? media.url
        } else if (paidQuality === '1080p') {
          const v = versions.find((v: any) => v.height === 1080)
          streamUrl = v?.url ?? (media as any).urlHq ?? media.url
        } else {
          const v = versions.find((v: any) => v.height === 720)
          streamUrl = v?.url ?? media.url
        }
      } else {
        // Normalize cap to at least 480 so legacy DB values (144/240/360) don't yield no match and fallback to 720p
        const cap = Math.max(480, freeStreamMaxHeight)
        const best = [...versions].filter((v: any) => v.height <= cap).pop()
        streamUrl = best?.url ?? media.url
      }
    }

    const payload: Record<string, unknown> = {
      ...media,
      fileSize: (media as any).fileSize === null || (media as any).fileSize === undefined ? null : (media as any).fileSize.toString(),
      avgRating: Math.round(avgRating * 10) / 10,
      views: media.views + 1,
    }
    if (streamUrl) payload.streamUrl = streamUrl
    if ((media as any).versions?.length) {
      payload.versions = (media as any).versions.map((v: any) => ({
        ...v,
        fileSize: v.fileSize != null ? v.fileSize.toString() : null,
      }))
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching media:', error)
    return NextResponse.json(
      { error: 'Failed to fetch media' },
      { status: 500 }
    )
  }
}

// PATCH - Update media (owner or admin only)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    // Only owner or admin can update
    if (media.userId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { title, description, aiTool, aiPrompt, realDevice, price, isPublic, isApproved } = body

    // Regular users can only update certain fields
    const updateData: any = {}
    if (title) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (aiTool !== undefined) updateData.aiTool = aiTool
    if (aiPrompt !== undefined) updateData.aiPrompt = aiPrompt
    if (realDevice !== undefined) updateData.realDevice = realDevice
    if (price !== undefined) updateData.price = price
    if (isPublic !== undefined) updateData.isPublic = isPublic

    // Only admin can change approval status
    if (session.user.role === 'ADMIN' && isApproved !== undefined) {
      updateData.isApproved = isApproved
    }

    const updatedMedia = await prisma.media.update({
      where: { id: mediaId },
      data: updateData,
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

    // Handle BigInt serialization for fileSize
    return NextResponse.json({ 
      media: {
        ...updatedMedia,
        fileSize: (updatedMedia as any).fileSize === null || (updatedMedia as any).fileSize === undefined 
          ? null 
          : (updatedMedia as any).fileSize.toString(),
      }
    })
  } catch (error) {
    console.error('Error updating media:', error)
    return NextResponse.json(
      { error: 'Failed to update media' },
      { status: 500 }
    )
  }
}

// DELETE - Delete media (owner or admin only)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    // Only owner or admin can delete
    if (media.userId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete files from filesystem
    try {
      const filePath = join(process.cwd(), 'public', media.url)
      await unlink(filePath)
      if (media.thumbnailUrl) {
        const thumbPath = join(process.cwd(), 'public', media.thumbnailUrl)
        await unlink(thumbPath)
      }
    } catch (e) {
      console.error('Error deleting files:', e)
    }

    // Delete from database
    await prisma.media.delete({
      where: { id: mediaId },
    })

    return NextResponse.json({ message: 'Media deleted successfully' })
  } catch (error) {
    console.error('Error deleting media:', error)
    return NextResponse.json(
      { error: 'Failed to delete media' },
      { status: 500 }
    )
  }
}


