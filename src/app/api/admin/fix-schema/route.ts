import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// This endpoint adds missing columns to the Media table and syncs sold status
export async function POST(request: Request) {
  const results: any[] = []
  
  try {
    // Step 1: Try to add isSold column if it doesn't exist
    try {
      await prisma.$executeRaw`ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "isSold" BOOLEAN DEFAULT false`
      results.push({ step: 'add_isSold_column', status: 'success' })
    } catch (err: any) {
      results.push({ step: 'add_isSold_column', status: 'skipped_or_error', message: err.message })
    }

    // Step 2: Try to add soldAt column if it doesn't exist
    try {
      await prisma.$executeRaw`ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "soldAt" TIMESTAMP(3)`
      results.push({ step: 'add_soldAt_column', status: 'success' })
    } catch (err: any) {
      results.push({ step: 'add_soldAt_column', status: 'skipped_or_error', message: err.message })
    }

    // Step 3: Try to add deleteAfter column if it doesn't exist
    try {
      await prisma.$executeRaw`ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "deleteAfter" TIMESTAMP(3)`
      results.push({ step: 'add_deleteAfter_column', status: 'success' })
    } catch (err: any) {
      results.push({ step: 'add_deleteAfter_column', status: 'skipped_or_error', message: err.message })
    }

    // Step 4: Find all completed purchases and mark their media as sold
    const completedPurchases = await prisma.purchase.findMany({
      where: { status: 'completed' },
      select: { 
        id: true,
        mediaId: true, 
        completedAt: true,
      },
    })

    results.push({ step: 'find_purchases', status: 'success', count: completedPurchases.length })

    // Step 5: Update each media item
    let updatedCount = 0
    for (const purchase of completedPurchases) {
      const soldAt = purchase.completedAt || new Date()
      const deleteAfter = new Date(soldAt.getTime() + 10 * 24 * 60 * 60 * 1000)

      try {
        await prisma.$executeRaw`
          UPDATE "Media" 
          SET "isSold" = true, 
              "soldAt" = ${soldAt}::timestamp, 
              "deleteAfter" = ${deleteAfter}::timestamp
          WHERE "id" = ${purchase.mediaId}
        `
        updatedCount++
      } catch (err: any) {
        results.push({ 
          step: 'update_media', 
          mediaId: purchase.mediaId, 
          status: 'error', 
          message: err.message 
        })
      }
    }

    results.push({ step: 'update_media', status: 'success', updatedCount })

    return NextResponse.json({ 
      success: true,
      results
    })
  } catch (error: any) {
    console.error('Error fixing schema:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fix schema', 
        details: error.message,
        results 
      },
      { status: 500 }
    )
  }
}

// GET - Check database status
export async function GET(request: Request) {
  try {
    // Try to query the Media table structure
    const tableInfo = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'Media' 
      AND column_name IN ('isSold', 'soldAt', 'deleteAfter')
    `

    // Count completed purchases
    const purchaseCount = await prisma.purchase.count({ 
      where: { status: 'completed' } 
    })

    return NextResponse.json({
      columns: tableInfo,
      completedPurchases: purchaseCount
    })
  } catch (error: any) {
    console.error('Error checking schema:', error)
    return NextResponse.json(
      { error: 'Failed to check schema', details: error.message },
      { status: 500 }
    )
  }
}




