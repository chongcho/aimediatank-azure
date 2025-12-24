import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Fetch private chat invites (notifications)
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ invites: [] })
    }

    // Get unread private chat notifications
    const notifications = await prisma.notification.findMany({
      where: {
        userId: session.user.id,
        type: 'private_chat',
        read: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    // Get sender details for each notification
    const invites = await Promise.all(
      notifications.map(async (notif) => {
        const sender = await prisma.user.findUnique({
          where: { id: notif.link || '' },
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
          },
        })
        return {
          notificationId: notif.id,
          sender,
          message: notif.message,
          createdAt: notif.createdAt,
        }
      })
    )

    // Filter out any invites where sender wasn't found
    const validInvites = invites.filter((inv) => inv.sender !== null)

    return NextResponse.json({ invites: validInvites })
  } catch (error) {
    console.error('Error fetching chat invites:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invites' },
      { status: 500 }
    )
  }
}

// POST - Mark invite as read (when user opens private chat with sender)
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { senderId } = await request.json()

    if (!senderId) {
      return NextResponse.json({ error: 'Sender ID required' }, { status: 400 })
    }

    // Mark all private chat notifications from this sender as read
    await prisma.notification.updateMany({
      where: {
        userId: session.user.id,
        type: 'private_chat',
        link: senderId,
        read: false,
      },
      data: {
        read: true,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error marking invite as read:', error)
    return NextResponse.json(
      { error: 'Failed to update invite' },
      { status: 500 }
    )
  }
}



