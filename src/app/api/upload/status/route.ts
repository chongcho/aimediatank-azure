import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  getCreditPool,
  normalizeMembershipType,
} from '@/lib/uploadPlanConfig'
import { getUploadPlanConfig } from '@/lib/membershipPlans'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        membershipType: true,
        freeUploadsUsed: true,
        freeUploadsResetAt: true,
        paidUploadCredits: true,
        bonusCredits: true,
        creditsUsed: true,
        _count: {
          select: { media: true }
        }
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const membershipType = normalizeMembershipType(user.membershipType)
    const config = await getUploadPlanConfig(membershipType)
    const freeUploadsUsed = user.freeUploadsUsed || 0
    const paidUploadCredits = user.paidUploadCredits || 0
    const bonusCredits = user.bonusCredits || 0
    const creditsUsed = user.creditsUsed || 0
    const totalCredits = getCreditPool(bonusCredits, paidUploadCredits)
    const freeUploadsRemaining =
      membershipType === 'PREMIUM'
        ? Infinity
        : Math.max(0, config.freeUploads - freeUploadsUsed)
    const uploadsAvailable =
      membershipType === 'PREMIUM'
        ? ('Unlimited' as const)
        : freeUploadsRemaining + totalCredits
    
    const isWithinFreeLimit = freeUploadsRemaining > 0 || membershipType === 'PREMIUM'
    const hasPaidCredits = totalCredits > 0
    const canUpload = isWithinFreeLimit || hasPaidCredits || config.canUploadAfterFree
    const nextUploadCost = isWithinFreeLimit || hasPaidCredits ? 0 : config.costPerUpload
    
    // Determine upload status message
    let statusMessage = ''
    let statusType: 'free' | 'paid' | 'blocked' = 'free'
    
    if (membershipType === 'PREMIUM') {
      statusMessage = '✨ Unlimited free uploads with Premium!'
      statusType = 'free'
    } else if (typeof uploadsAvailable === 'number' && uploadsAvailable > 0) {
      const parts: string[] = []
      if (freeUploadsRemaining > 0) {
        parts.push(`${freeUploadsRemaining} free`)
      }
      if (totalCredits > 0) {
        parts.push(`${totalCredits} credit${totalCredits !== 1 ? 's' : ''}`)
      }
      statusMessage =
        parts.length > 1
          ? `🎁 You have ${uploadsAvailable} upload credits (${parts.join(' + ')})`
          : `🎁 You have ${uploadsAvailable} upload credit${uploadsAvailable !== 1 ? 's' : ''}`
      statusType = 'free'
    } else if (config.canUploadAfterFree) {
      statusMessage = `💳 Each upload costs $${config.costPerUpload.toFixed(2)}`
      statusType = 'paid'
    } else {
      statusMessage = '⚠️ Free uploads exhausted. Upgrade to continue uploading.'
      statusType = 'blocked'
    }

    return NextResponse.json({
      membershipType,
      totalUploads: user._count?.media || 0,
      freeUploads: config.freeUploads === Infinity ? 'Unlimited' : config.freeUploads,
      freeUploadsUsed,
      freeUploadsRemaining: freeUploadsRemaining === Infinity ? 'Unlimited' : freeUploadsRemaining,
      paidUploadCredits,
      bonusCredits,
      totalCredits,
      uploadsAvailable,
      creditsUsed,
      costPerUpload: config.costPerUpload,
      nextUploadCost,
      canUpload,
      statusMessage,
      statusType,
      planDescription:
        membershipType === 'PREMIUM'
          ? 'Unlimited Free Uploads'
          : membershipType === 'VIEWER'
            ? `${config.freeUploads} Free Uploads (upgrade to continue uploading)`
            : `${config.freeUploads} Free Uploads, then $${config.costPerUpload.toFixed(2)} per upload`,
    })
  } catch (error) {
    console.error('Error getting upload status:', error)
    return NextResponse.json(
      { error: 'Failed to get upload status' },
      { status: 500 }
    )
  }
}
