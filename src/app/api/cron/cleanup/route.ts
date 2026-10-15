import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCronAuth } from '@/lib/cronAuth'

export const dynamic = 'force-dynamic'

// Purchases pay for a download. This job no longer deletes sold media.
// It clears leftover sale-deletion schedules and puts those listings back on the feed.
export async function GET(request: Request) {
  try {
    const authError = requireCronAuth(request)
    if (authError) return authError

    const republished = await prisma.media.updateMany({
      where: {
        deleteAfter: { not: null },
        isPublic: false,
        isDeleted: false,
      },
      data: {
        isPublic: true,
        deleteAfter: null,
      },
    })

    const cleared = await prisma.media.updateMany({
      where: { deleteAfter: { not: null } },
      data: { deleteAfter: null },
    })

    return NextResponse.json({
      message: 'Sold media is kept. Cleared leftover deletion schedules.',
      deleted: 0,
      republished: republished.count,
      clearedSchedules: cleared.count,
    })
  } catch (error) {
    console.error('Cleanup cron error:', error)
    return NextResponse.json(
      { error: 'Cleanup failed', details: (error as Error).message },
      { status: 500 }
    )
  }
}






