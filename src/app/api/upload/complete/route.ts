import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Complete the upload by creating the database record
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'SUBSCRIBER' && session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only subscribers can upload media' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      title,
      description,
      type,
      url,
      thumbnailUrl,
      aiTool,
      aiPrompt,
      price,
      isPublic = true,
    } = body

    if (!title || !type || !url) {
      return NextResponse.json(
        { error: 'title, type, and url are required' },
        { status: 400 }
      )
    }

    // Validate type
    if (!['VIDEO', 'IMAGE', 'MUSIC'].includes(type)) {
      return NextResponse.json({ error: 'Invalid media type' }, { status: 400 })
    }

    // Create media record
    const media = await prisma.media.create({
      data: {
        title,
        description: description || '',
        type: type as 'VIDEO' | 'IMAGE' | 'MUSIC',
        url,
        thumbnailUrl: thumbnailUrl || null,
        aiTool: aiTool || null,
        aiPrompt: aiPrompt || null,
        price: price ? parseFloat(price) : null,
        isPublic,
        isApproved: true, // Auto-approve for now
        userId: session.user.id,
      },
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

    return NextResponse.json({ media })
  } catch (error) {
    console.error('Error completing upload:', error)
    return NextResponse.json(
      { error: 'Failed to complete upload' },
      { status: 500 }
    )
  }
}

