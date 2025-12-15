import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET - Get user's messages (inbox)
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'inbox' // inbox, sent

    let messages

    if (type === 'sent') {
      messages = await prisma.message.findMany({
        where: { senderId: session.user.id },
        include: {
          receiver: {
            select: {
              id: true,
              username: true,
              name: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    } else {
      messages = await prisma.message.findMany({
        where: { receiverId: session.user.id },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              name: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    }

    // Get unread count
    const unreadCount = await prisma.message.count({
      where: {
        receiverId: session.user.id,
        isRead: false,
      },
    })

    return NextResponse.json({ messages, unreadCount })
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    )
  }
}

// POST - Send a message
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { receiverId, content } = await request.json()

    if (!receiverId || !content || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Receiver and content are required' },
        { status: 400 }
      )
    }

    // Can't message yourself
    if (receiverId === session.user.id) {
      return NextResponse.json(
        { error: "You can't message yourself" },
        { status: 400 }
      )
    }

    // Check if receiver exists
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
    })

    if (!receiver) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const message = await prisma.message.create({
      data: {
        content: content.trim(),
        senderId: session.user.id,
        receiverId,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
          },
        },
      },
    })

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Error sending message:', error)
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    )
  }
}

// PATCH - Mark messages as read
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messageIds } = await request.json()

    if (!messageIds || !Array.isArray(messageIds)) {
      return NextResponse.json(
        { error: 'Message IDs are required' },
        { status: 400 }
      )
    }

    // Only mark messages where the user is the receiver
    await prisma.message.updateMany({
      where: {
        id: { in: messageIds },
        receiverId: session.user.id,
      },
      data: { isRead: true },
    })

    return NextResponse.json({ message: 'Messages marked as read' })
  } catch (error) {
    console.error('Error marking messages as read:', error)
    return NextResponse.json(
      { error: 'Failed to mark messages as read' },
      { status: 500 }
    )
  }
}


