import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Fetch user's notifications
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get notifications from the database
    const notifications = await prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const unreadCount = await prisma.notification.count({
      where: { 
        userId: session.user.id,
        read: false 
      },
    })

    return NextResponse.json({
      notifications,
      unreadCount,
    })
  } catch (error: any) {
    // If the Notification model doesn't exist yet, return empty
    if (error.code === 'P2021' || error.message?.includes('does not exist')) {
      return NextResponse.json({
        notifications: [],
        unreadCount: 0,
      })
    }
    console.error('Error fetching notifications:', error)
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    )
  }
}




