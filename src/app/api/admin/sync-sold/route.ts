import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// POST - Sync sold status for all completed purchases
// This marks media items as SOLD if they have completed purchases
export async function POST(request: Request) {
  try {
    // Find all completed purchases
    const completedPurchases = await prisma.purchase.findMany({
      where: { status: 'completed' },
      select: { 
        id: true,
        mediaId: true, 
        completedAt: true,
        media: {
          select: {
            id: true,
            title: true,
            isSold: true,
          }
        }
      },
    })

    const results = []

    for (const purchase of completedPurchases) {
      // Skip if already marked as sold
      if (purchase.media.isSold) {
        results.push({
          mediaId: purchase.mediaId,
          title: purchase.media.title,
          status: 'already_sold'
        })
        continue
      }

      // Calculate delete date (10 days from purchase completion or now)
      const soldAt = purchase.completedAt || new Date()
      const deleteAfter = new Date(soldAt.getTime() + 10 * 24 * 60 * 60 * 1000)

      try {
        await prisma.media.update({
          where: { id: purchase.mediaId },
          data: {
            isSold: true,
            soldAt: soldAt,
            deleteAfter: deleteAfter,
          },
        })

        results.push({
          mediaId: purchase.mediaId,
          title: purchase.media.title,
          status: 'marked_sold',
          deleteAfter: deleteAfter.toISOString()
        })
      } catch (err) {
        results.push({
          mediaId: purchase.mediaId,
          title: purchase.media.title,
          status: 'error',
          error: String(err)
        })
      }
    }

    return NextResponse.json({ 
      success: true,
      totalPurchases: completedPurchases.length,
      results
    })
  } catch (error) {
    console.error('Error syncing sold status:', error)
    return NextResponse.json(
      { error: 'Failed to sync sold status', details: String(error) },
      { status: 500 }
    )
  }
}

// GET - Check current sync status
export async function GET(request: Request) {
  try {
    const [completedPurchases, soldMedia] = await Promise.all([
      prisma.purchase.count({ where: { status: 'completed' } }),
      prisma.media.count({ where: { isSold: true } }),
    ])

    // Find purchases where media is not marked as sold
    const unsyncedPurchases = await prisma.purchase.findMany({
      where: { 
        status: 'completed',
        media: { isSold: false }
      },
      include: {
        media: {
          select: { id: true, title: true, isSold: true }
        }
      }
    })

    return NextResponse.json({
      completedPurchases,
      soldMedia,
      unsyncedCount: unsyncedPurchases.length,
      unsynced: unsyncedPurchases.map(p => ({
        purchaseId: p.id,
        mediaId: p.mediaId,
        mediaTitle: p.media.title,
        isSold: p.media.isSold
      }))
    })
  } catch (error) {
    console.error('Error checking sync status:', error)
    return NextResponse.json(
      { error: 'Failed to check sync status', details: String(error) },
      { status: 500 }
    )
  }
}

