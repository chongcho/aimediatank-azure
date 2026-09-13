import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildMonthlyUploadLimitMessage, getUploadPlanConfig } from '@/lib/membershipPlans'

export const dynamic = 'force-dynamic'

/**
 * Pay-per-upload checkout is retired. Over free allowance, users must upgrade membership.
 * Kept so old clients get a clear 403 instead of a Stripe session.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { membershipType: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const config = await getUploadPlanConfig(user.membershipType)
    return NextResponse.json(
      {
        error: buildMonthlyUploadLimitMessage(
          Number.isFinite(config.freeUploads) ? config.freeUploads : 0
        ),
        upgradeRequired: true,
        freeUploadsLimit: Number.isFinite(config.freeUploads) ? config.freeUploads : 0,
      },
      { status: 403 }
    )
  } catch (error) {
    console.error('Upload payment error:', error)
    return NextResponse.json({ error: 'Failed to process upload payment' }, { status: 500 })
  }
}
