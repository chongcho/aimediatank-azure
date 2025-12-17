import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Upload limits and costs per plan
const UPLOAD_CONFIG: Record<string, { 
  freeUploads: number; 
  costPerUpload: number; 
  canUploadAfterFree: boolean;
  description: string;
}> = {
  VIEWER: { 
    freeUploads: 5, 
    costPerUpload: 0, 
    canUploadAfterFree: false,
    description: '5 Free Uploads (upgrade to continue uploading)'
  },
  BASIC: { 
    freeUploads: 5, 
    costPerUpload: 1.00, 
    canUploadAfterFree: true,
    description: '5 Free Uploads, then $1.00 per upload'
  },
  ADVANCED: { 
    freeUploads: 5, 
    costPerUpload: 0.50, 
    canUploadAfterFree: true,
    description: '5 Free Uploads, then $0.50 per upload'
  },
  PREMIUM: { 
    freeUploads: Infinity, 
    costPerUpload: 0, 
    canUploadAfterFree: true,
    description: 'Unlimited Free Uploads'
  },
}

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
        _count: {
          select: { media: true }
        }
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const config = UPLOAD_CONFIG[user.membershipType] || UPLOAD_CONFIG.VIEWER
    const freeUploadsUsed = user.freeUploadsUsed || 0
    const paidUploadCredits = user.paidUploadCredits || 0
    const freeUploadsRemaining = user.membershipType === 'PREMIUM' 
      ? Infinity 
      : Math.max(0, config.freeUploads - freeUploadsUsed)
    
    const isWithinFreeLimit = freeUploadsRemaining > 0 || user.membershipType === 'PREMIUM'
    const hasPaidCredits = paidUploadCredits > 0
    const canUpload = isWithinFreeLimit || hasPaidCredits || config.canUploadAfterFree
    const nextUploadCost = isWithinFreeLimit || hasPaidCredits ? 0 : config.costPerUpload
    
    // Determine upload status message
    let statusMessage = ''
    let statusType: 'free' | 'paid' | 'blocked' = 'free'
    
    if (user.membershipType === 'PREMIUM') {
      statusMessage = '✨ Unlimited free uploads with Premium!'
      statusType = 'free'
    } else if (freeUploadsRemaining > 0) {
      statusMessage = `🎁 ${freeUploadsRemaining} free upload${freeUploadsRemaining !== 1 ? 's' : ''} remaining`
      statusType = 'free'
    } else if (hasPaidCredits) {
      statusMessage = `✅ ${paidUploadCredits} paid upload credit${paidUploadCredits !== 1 ? 's' : ''} available`
      statusType = 'free' // Treat paid credits as "free" since payment is already done
    } else if (config.canUploadAfterFree) {
      statusMessage = `💳 Each upload costs $${config.costPerUpload.toFixed(2)}`
      statusType = 'paid'
    } else {
      statusMessage = '⚠️ Free uploads exhausted. Upgrade to continue uploading.'
      statusType = 'blocked'
    }

    return NextResponse.json({
      membershipType: user.membershipType,
      totalUploads: user._count?.media || 0,
      freeUploads: config.freeUploads === Infinity ? 'Unlimited' : config.freeUploads,
      freeUploadsUsed,
      freeUploadsRemaining: freeUploadsRemaining === Infinity ? 'Unlimited' : freeUploadsRemaining,
      paidUploadCredits,
      costPerUpload: config.costPerUpload,
      nextUploadCost,
      canUpload,
      statusMessage,
      statusType,
      planDescription: config.description,
    })
  } catch (error) {
    console.error('Error getting upload status:', error)
    return NextResponse.json(
      { error: 'Failed to get upload status' },
      { status: 500 }
    )
  }
}

