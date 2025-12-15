import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// POST - Mark a media item as SOLD (for testing only)
// This should be removed in production
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { mediaId, markAsSold } = await request.json()

    if (!mediaId) {
      return NextResponse.json({ error: 'mediaId is required' }, { status: 400 })
    }

    const now = new Date()
    const deleteAfter = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000) // 10 days from now

    const media = await prisma.media.update({
      where: { id: mediaId },
      data: {
        isSold: markAsSold !== false, // default to true
        soldAt: markAsSold !== false ? now : null,
        deleteAfter: markAsSold !== false ? deleteAfter : null,
      },
    })

    return NextResponse.json({ 
      success: true, 
      media: {
        id: media.id,
        title: media.title,
        isSold: media.isSold,
        soldAt: media.soldAt,
        deleteAfter: media.deleteAfter,
      }
    })
  } catch (error) {
    console.error('Error marking media as sold:', error)
    return NextResponse.json(
      { error: 'Failed to update media', details: String(error) },
      { status: 500 }
    )
  }
}




