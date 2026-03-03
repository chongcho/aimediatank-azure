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

    const notifications = await prisma.notification.findMany({
      where: { 
        userId: session.user.id,
        type: { not: 'private_chat' }
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const unreadCount = await prisma.notification.count({
      where: { 
        userId: session.user.id,
        read: false,
        type: { not: 'private_chat' }
      },
    })

    return NextResponse.json({
      notifications,
      unreadCount,
    })
  } catch (error: any) {
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

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { ids } = body as { ids?: string[] }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
    }

    await prisma.notification.deleteMany({
      where: {
        id: { in: ids },
        userId: session.user.id,
      },
    })

    return NextResponse.json({ deleted: ids.length })
  } catch (error: any) {
    if (error.code === 'P2021' || error.message?.includes('does not exist')) {
      return NextResponse.json({ deleted: 0 })
    }
    console.error('Error deleting notifications:', error)
    return NextResponse.json(
      { error: 'Failed to delete notifications' },
      { status: 500 }
    )
  }
}




