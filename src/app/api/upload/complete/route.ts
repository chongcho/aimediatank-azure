import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, generateUploadLimitEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

// Upload cost per plan (after free uploads)
const UPLOAD_COSTS: Record<string, { freeUploads: number; costAfter: string }> = {
  VIEWER: { freeUploads: 5, costAfter: 'No more uploads allowed' },
  BASIC: { freeUploads: 5, costAfter: '$1.00 per upload' },
  ADVANCED: { freeUploads: 5, costAfter: '$0.50 per upload' },
  PREMIUM: { freeUploads: Infinity, costAfter: 'Free' },
}

// Complete the upload by creating the database record
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user with upload tracking info
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        membershipType: true,
        freeUploadsUsed: true,
        freeUploadsResetAt: true,
        _count: {
          select: { media: true }
        }
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const planConfig = UPLOAD_COSTS[user.membershipType] || UPLOAD_COSTS.VIEWER
    const freeUploadsRemaining = planConfig.freeUploads - (user.freeUploadsUsed || 0)
    const isFreeUpload = freeUploadsRemaining > 0

    // Check if user has exhausted free uploads (for VIEWER plan only)
    if (user.membershipType === 'VIEWER' && freeUploadsRemaining <= 0) {
      return NextResponse.json(
        { error: 'You have used all 5 free uploads. Upgrade your plan to upload more.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      title,
      description,
      type,
      url,
      thumbnailUrl,
      aiTool,
      aiPrompt,
      price,
      isPublic = true,
    } = body

    if (!title || !type || !url) {
      return NextResponse.json(
        { error: 'title, type, and url are required' },
        { status: 400 }
      )
    }

    // Validate type
    if (!['VIDEO', 'IMAGE', 'MUSIC'].includes(type)) {
      return NextResponse.json({ error: 'Invalid media type' }, { status: 400 })
    }

    // Create media record
    const media = await prisma.media.create({
      data: {
        title,
        description: description || '',
        type: type as 'VIDEO' | 'IMAGE' | 'MUSIC',
        url,
        thumbnailUrl: thumbnailUrl || null,
        aiTool: aiTool || null,
        aiPrompt: aiPrompt || null,
        price: price ? parseFloat(price) : null,
        isPublic,
        isApproved: true, // Auto-approve for now
        userId: session.user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
          },
        },
      },
    })

    // Increment free uploads used (for non-Premium plans)
    if (user.membershipType !== 'PREMIUM') {
      const newFreeUploadsUsed = (user.freeUploadsUsed || 0) + 1
      
      await prisma.user.update({
        where: { id: user.id },
        data: { freeUploadsUsed: newFreeUploadsUsed },
      })

      // Check if this was the last free upload - send notification
      if (newFreeUploadsUsed >= planConfig.freeUploads && user.membershipType !== 'VIEWER') {
        const totalUploads = (user._count?.media || 0) + 1

        // Send email notification
        const emailHtml = generateUploadLimitEmail(
          user.name || user.username,
          user.membershipType + ' Plan',
          totalUploads,
          planConfig.freeUploads,
          planConfig.costAfter
        )

        await sendEmail({
          to: user.email,
          subject: '📊 Free Uploads Exhausted - Upload Summary | AI Media Tank',
          html: emailHtml
        })

        // Create in-app notification
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: 'system',
            title: 'Free Uploads Used',
            message: `You've used all ${planConfig.freeUploads} free uploads. Future uploads will cost ${planConfig.costAfter}.`,
            link: '/pricing',
          }
        })

        console.log(`Sent free uploads exhausted notification to ${user.email}`)
      }
    }

    // Calculate upload info for response
    const uploadsUsed = user.membershipType !== 'PREMIUM' 
      ? (user.freeUploadsUsed || 0) + 1 
      : 0
    const uploadsRemaining = user.membershipType === 'PREMIUM' 
      ? 'Unlimited' 
      : Math.max(0, planConfig.freeUploads - uploadsUsed)

    return NextResponse.json({ 
      media,
      uploadInfo: {
        isFreeUpload,
        freeUploadsUsed: uploadsUsed,
        freeUploadsRemaining: uploadsRemaining,
        costAfterFree: planConfig.costAfter,
      }
    })
  } catch (error) {
    console.error('Error completing upload:', error)
    return NextResponse.json(
      { error: 'Failed to complete upload' },
      { status: 500 }
    )
  }
}

