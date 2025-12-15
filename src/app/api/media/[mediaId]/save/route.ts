import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// POST - Save media (bookmark)
export async function POST(
  request: Request,
  { params }: { params: { mediaId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { mediaId } = params

    // Check if media exists
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    // Check if already saved
    const existingSave = await prisma.savedMedia.findUnique({
      where: {
        userId_mediaId: {
          userId: session.user.id,
          mediaId,
        },
      },
    })

    if (existingSave) {
      return NextResponse.json({ error: 'Already saved', saved: true }, { status: 400 })
    }

    // Create save record
    await prisma.savedMedia.create({
      data: {
        userId: session.user.id,
        mediaId,
      },
    })

    return NextResponse.json({ message: 'Media saved', saved: true })
  } catch (error) {
    console.error('Error saving media:', error)
    return NextResponse.json(
      { error: 'Failed to save media' },
      { status: 500 }
    )
  }
}

// DELETE - Unsave media (remove bookmark)
export async function DELETE(
  request: Request,
  { params }: { params: { mediaId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { mediaId } = params

    // Delete save record
    await prisma.savedMedia.deleteMany({
      where: {
        userId: session.user.id,
        mediaId,
      },
    })

    return NextResponse.json({ message: 'Media unsaved', saved: false })
  } catch (error) {
    console.error('Error unsaving media:', error)
    return NextResponse.json(
      { error: 'Failed to unsave media' },
      { status: 500 }
    )
  }
}

// GET - Check if media is saved
export async function GET(
  request: Request,
  { params }: { params: { mediaId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ saved: false })
    }

    const { mediaId } = params

    const savedMedia = await prisma.savedMedia.findUnique({
      where: {
        userId_mediaId: {
          userId: session.user.id,
          mediaId,
        },
      },
    })

    return NextResponse.json({ saved: !!savedMedia })
  } catch (error) {
    console.error('Error checking saved status:', error)
    return NextResponse.json({ saved: false })
  }
}






