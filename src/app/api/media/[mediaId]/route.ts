import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { unlink } from 'fs/promises'
import { join } from 'path'

// GET - Fetch single media with details
export async function GET(
  request: Request,
  { params }: { params: { mediaId: string } }
) {
  try {
    const media = await prisma.media.findUnique({
      where: { id: params.mediaId },
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
      },
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    // Increment view count
    await prisma.media.update({
      where: { id: params.mediaId },
      data: { views: { increment: 1 } },
    })

    // Calculate average rating
    const avgRating =
      media.ratings.length > 0
        ? media.ratings.reduce((acc, r) => acc + r.score, 0) / media.ratings.length
        : 0

    return NextResponse.json({
      ...media,
      avgRating: Math.round(avgRating * 10) / 10,
      views: media.views + 1,
    })
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
  { params }: { params: { mediaId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const media = await prisma.media.findUnique({
      where: { id: params.mediaId },
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    // Only owner or admin can update
    if (media.userId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { title, description, aiTool, aiPrompt, price, isPublic, isApproved } = body

    // Regular users can only update certain fields
    const updateData: any = {}
    if (title) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (aiTool !== undefined) updateData.aiTool = aiTool
    if (aiPrompt !== undefined) updateData.aiPrompt = aiPrompt
    if (price !== undefined) updateData.price = price
    if (isPublic !== undefined) updateData.isPublic = isPublic

    // Only admin can change approval status
    if (session.user.role === 'ADMIN' && isApproved !== undefined) {
      updateData.isApproved = isApproved
    }

    const updatedMedia = await prisma.media.update({
      where: { id: params.mediaId },
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

    return NextResponse.json({ media: updatedMedia })
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
  { params }: { params: { mediaId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const media = await prisma.media.findUnique({
      where: { id: params.mediaId },
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
      where: { id: params.mediaId },
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


