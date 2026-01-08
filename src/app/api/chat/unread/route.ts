import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Get unread private message count
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ unreadCount: 0 })
    }

    // Get all conversations where user is a member
    const memberships = await prisma.conversationMember.findMany({
      where: { userId: session.user.id },
      select: {
        conversationId: true,
        lastReadAt: true,
      },
    })

    if (memberships.length === 0) {
      // Also check for invites (notification-based)
      const inviteCount = await prisma.notification.count({
        where: {
          userId: session.user.id,
          type: 'private_chat',
          read: false,
        },
      })
      return NextResponse.json({ unreadCount: inviteCount })
    }

    // Count unread messages across all conversations
    let totalUnread = 0

    for (const membership of memberships) {
      const unreadCount = await prisma.chatMessage.count({
        where: {
          conversationId: membership.conversationId,
          userId: { not: session.user.id }, // Messages from others
          createdAt: membership.lastReadAt 
            ? { gt: membership.lastReadAt } 
            : undefined, // If never read, count all messages
        },
      })
      totalUnread += unreadCount
    }

    // Also add pending invites (notifications for new chats)
    const inviteCount = await prisma.notification.count({
      where: {
        userId: session.user.id,
        type: 'private_chat',
        read: false,
      },
    })

    return NextResponse.json({ 
      unreadCount: totalUnread + inviteCount 
    })
  } catch (error) {
    console.error('Error fetching unread count:', error)
    return NextResponse.json({ unreadCount: 0 })
  }
}

// POST - Mark conversation as read (update lastReadAt)
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { conversationId } = await request.json()

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 })
    }

    // Update lastReadAt for the user's membership in this conversation
    await prisma.conversationMember.updateMany({
      where: {
        conversationId,
        userId: session.user.id,
      },
      data: {
        lastReadAt: new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error marking conversation as read:', error)
    return NextResponse.json(
      { error: 'Failed to mark as read' },
      { status: 500 }
    )
  }
}

