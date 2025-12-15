import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// This endpoint syncs notifications for purchases that don't have them yet
export async function POST(request: Request) {
  const results: any[] = []

  try {
    // Step 1: Try to add Notification table if it doesn't exist
    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "Notification" (
          "id" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "message" TEXT NOT NULL,
          "link" TEXT,
          "read" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "userId" TEXT NOT NULL,
          CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `
      results.push({ step: 'create_notification_table', status: 'success' })
    } catch (err: any) {
      results.push({ step: 'create_notification_table', status: 'skipped_or_exists', message: err.message })
    }

    // Step 2: Create indexes
    try {
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId")`
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Notification_read_idx" ON "Notification"("read")`
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt")`
      results.push({ step: 'create_indexes', status: 'success' })
    } catch (err: any) {
      results.push({ step: 'create_indexes', status: 'skipped_or_error', message: err.message })
    }

    // Step 3: Find all completed purchases
    const completedPurchases = await prisma.purchase.findMany({
      where: { status: 'completed' },
      include: {
        buyer: {
          select: { id: true, email: true, name: true, username: true }
        },
        media: {
          select: { id: true, title: true, price: true }
        }
      },
      orderBy: { completedAt: 'desc' }
    })

    results.push({ step: 'find_purchases', count: completedPurchases.length })

    // Step 4: Create notifications for each purchase
    let created = 0
    for (const purchase of completedPurchases) {
      try {
        // Check if notification already exists for this purchase
        const existingNotification = await prisma.$queryRaw`
          SELECT id FROM "Notification" 
          WHERE "userId" = ${purchase.buyer.id} 
          AND "type" = 'purchase'
          AND "message" LIKE ${`%${purchase.media.title}%`}
          LIMIT 1
        ` as any[]

        if (existingNotification.length === 0) {
          // Create notification
          const notificationId = crypto.randomUUID()
          await prisma.$executeRaw`
            INSERT INTO "Notification" ("id", "type", "title", "message", "link", "read", "createdAt", "userId")
            VALUES (
              ${notificationId},
              'purchase',
              'Purchase Confirmed! 🎉',
              ${'Your purchase of "' + purchase.media.title + '" is complete. Download within 10 days before it expires.'},
              ${'/profile/' + purchase.buyer.username},
              false,
              ${purchase.completedAt || new Date()},
              ${purchase.buyer.id}
            )
          `
          created++
        }
      } catch (err: any) {
        results.push({ 
          step: 'create_notification', 
          purchaseId: purchase.id,
          status: 'error', 
          message: err.message 
        })
      }
    }

    results.push({ step: 'create_notifications', created })

    return NextResponse.json({
      success: true,
      results
    })
  } catch (error: any) {
    console.error('Error syncing notifications:', error)
    return NextResponse.json(
      { error: 'Failed to sync notifications', details: error.message, results },
      { status: 500 }
    )
  }
}

// GET - Check notification status
export async function GET(request: Request) {
  try {
    // Check if table exists
    let tableExists = false
    try {
      const result = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'Notification'
        )
      ` as any[]
      tableExists = result[0]?.exists || false
    } catch (e) {
      tableExists = false
    }

    let notificationCount = 0
    let purchaseCount = 0

    if (tableExists) {
      const countResult = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Notification"` as any[]
      notificationCount = parseInt(countResult[0]?.count || '0')
    }

    purchaseCount = await prisma.purchase.count({ where: { status: 'completed' } })

    return NextResponse.json({
      tableExists,
      notificationCount,
      completedPurchases: purchaseCount,
      needsSync: purchaseCount > notificationCount
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to check status', details: error.message },
      { status: 500 }
    )
  }
}




