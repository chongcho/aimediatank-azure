import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Fetch recent chat messages
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const after = searchParams.get('after') // Get messages after this timestamp
    const mode = searchParams.get('mode') || 'open' // 'open' or 'private'
    const recipientId = searchParams.get('recipientId') // For private chat

    let where: any = {}
    
    if (after) {
      where.createdAt = {
        gt: new Date(after),
      }
    }

    if (mode === 'private') {
      // Private chat: only messages between current user and recipient
      if (!session?.user?.id || !recipientId) {
        return NextResponse.json({ messages: [] })
      }
      
      where.isPrivate = true
      where.OR = [
        { userId: session.user.id, recipientId: recipientId },
        { userId: recipientId, recipientId: session.user.id },
      ]
    } else {
      // Open chat: only public messages (isPrivate = false or null)
      where.isPrivate = false
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
    })

    // Reverse to get chronological order
    return NextResponse.json({
      messages: messages.reverse(),
    })
  } catch (error) {
    console.error('Error fetching chat messages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    )
  }
}

// POST - Send a new chat message (Subscribers only)
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only subscribers and admins can send messages
    if (session.user.role !== 'SUBSCRIBER' && session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only subscribers can send chat messages' },
        { status: 403 }
      )
    }

    const { content, isPrivate, recipientId } = await request.json()

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      )
    }

    // Limit message length
    if (content.length > 500) {
      return NextResponse.json(
        { error: 'Message too long (max 500 characters)' },
        { status: 400 }
      )
    }

    // Validate private message has recipient
    if (isPrivate && !recipientId) {
      return NextResponse.json(
        { error: 'Recipient is required for private messages' },
        { status: 400 }
      )
    }

    const message = await prisma.chatMessage.create({
      data: {
        content: content.trim(),
        userId: session.user.id,
        isPrivate: isPrivate || false,
        recipientId: isPrivate ? recipientId : null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
    })

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Error sending chat message:', error)
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    )
  }
}

