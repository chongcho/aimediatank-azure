import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Fetch user's purchased items
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all completed purchases for this user
    const purchases = await prisma.purchase.findMany({
      where: {
        buyerId: session.user.id,
        status: 'completed',
      },
      include: {
        media: {
          select: {
            id: true,
            title: true,
            type: true,
            url: true,
            thumbnailUrl: true,
            price: true,
            isSold: true,
            soldAt: true,
            deleteAfter: true,
            user: {
              select: {
                username: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
    })

    // Filter out purchases where media might be deleted
    const validPurchases = purchases.filter(p => p.media !== null)

    return NextResponse.json({
      purchases: validPurchases,
    })
  } catch (error) {
    console.error('Error fetching purchases:', error)
    return NextResponse.json(
      { error: 'Failed to fetch purchases' },
      { status: 500 }
    )
  }
}
