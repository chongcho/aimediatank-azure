import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendIosBadgeUpdateToUser } from '@/lib/apnsAlertPush'
import { getChatUnreadCountForUser } from '@/lib/chatUnreadCount'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Get unread private message count
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ unreadCount: 0 })
    }

    const unreadCount = await getChatUnreadCountForUser(session.user.id)
    return NextResponse.json({ unreadCount })
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

    const unreadCount = await getChatUnreadCountForUser(session.user.id)
    void sendIosBadgeUpdateToUser(session.user.id, unreadCount)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error marking conversation as read:', error)
    return NextResponse.json(
      { error: 'Failed to mark as read' },
      { status: 500 }
    )
  }
}
