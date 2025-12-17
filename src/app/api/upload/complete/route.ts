import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

// Upload limits and costs per plan
const UPLOAD_CONFIG: Record<string, { 
  freeUploads: number; 
  costPerUpload: number; 
  canUploadAfterFree: boolean;
}> = {
  VIEWER: { freeUploads: 5, costPerUpload: 0, canUploadAfterFree: false },
  BASIC: { freeUploads: 5, costPerUpload: 1.00, canUploadAfterFree: true },
  ADVANCED: { freeUploads: 5, costPerUpload: 0.50, canUploadAfterFree: true },
  PREMIUM: { freeUploads: Infinity, costPerUpload: 0, canUploadAfterFree: true },
}

// Generate upload confirmation email
function generateUploadConfirmationEmail(
  userName: string,
  mediaTitle: string,
  uploadNumber: number,
  freeUploadsRemaining: number | string,
  isFreeUpload: boolean,
  uploadCost: number,
  planName: string
): string {
  const remainingText = freeUploadsRemaining === 'Unlimited' 
    ? 'Unlimited' 
    : `${freeUploadsRemaining} remaining`

  const costSection = isFreeUpload 
    ? `<p style="color: #0f8; font-weight: bold;">✅ This was a FREE upload!</p>`
    : `<p style="color: #ffa500; font-weight: bold;">💳 Upload cost: $${uploadCost.toFixed(2)}</p>`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #0f8; margin: 0; font-size: 24px;">🎬 Upload Successful!</h1>
  </div>
  
  <p style="font-size: 16px;">Hi ${userName},</p>
  
  <p style="font-size: 16px;">Your content "<strong>${mediaTitle}</strong>" has been uploaded successfully!</p>
  
  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0f8;">
    <h3 style="margin: 0 0 15px 0; color: #1a1a2e;">Upload Summary</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #666;">Plan:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${planName}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Upload #:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${uploadNumber}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Free Uploads:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${remainingText}</td>
      </tr>
    </table>
    ${costSection}
  </div>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://aimediatank.com" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      View Your Content
    </a>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
</body>
</html>
  `
}

// Generate free uploads exhausted email
function generateFreeUploadsExhaustedEmail(
  userName: string,
  planName: string,
  costPerUpload: number
): string {
  const nextStepSection = costPerUpload > 0
    ? `<p style="font-size: 16px;">Future uploads will cost <strong>$${costPerUpload.toFixed(2)} per upload</strong>.</p>
       <p style="font-size: 16px;">Consider upgrading to <strong>Premium Plan</strong> for unlimited free uploads!</p>`
    : `<p style="font-size: 16px;">You've reached the upload limit for your plan. <strong>Upgrade now</strong> to continue uploading!</p>`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #ffa500; margin: 0; font-size: 24px;">⚠️ Free Uploads Exhausted</h1>
  </div>
  
  <p style="font-size: 16px;">Hi ${userName},</p>
  
  <p style="font-size: 16px;">You've used all <strong>5 free uploads</strong> included with your <strong>${planName}</strong>.</p>
  
  <div style="background: #fff8e6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffa500;">
    ${nextStepSection}
  </div>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://aimediatank.com/pricing" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      View Plans
    </a>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
</body>
</html>
  `
}

// Generate paid upload email
function generatePaidUploadEmail(
  userName: string,
  mediaTitle: string,
  uploadCost: number,
  totalPaidUploads: number,
  totalCost: number
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #ffa500; margin: 0; font-size: 24px;">💳 Paid Upload Processed</h1>
  </div>
  
  <p style="font-size: 16px;">Hi ${userName},</p>
  
  <p style="font-size: 16px;">Your paid upload "<strong>${mediaTitle}</strong>" has been processed.</p>
  
  <div style="background: #fff8e6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffa500;">
    <h3 style="margin: 0 0 15px 0; color: #1a1a2e;">Upload Charge</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #666;">This Upload:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">$${uploadCost.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Paid Uploads This Period:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${totalPaidUploads}</td>
      </tr>
      <tr style="border-top: 1px solid #ddd;">
        <td style="padding: 8px 0; color: #666; font-weight: bold;">Total Charges:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #ffa500;">$${totalCost.toFixed(2)}</td>
      </tr>
    </table>
  </div>

  <p style="font-size: 14px; color: #666;">
    💡 <strong>Tip:</strong> Upgrade to Premium for unlimited free uploads and save on upload costs!
  </p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://aimediatank.com/pricing" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      Upgrade to Premium
    </a>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
</body>
</html>
  `
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
    
    const isFreeUpload = freeUploadsRemaining > 0 || user.membershipType === 'PREMIUM'
    const hasPaidCredit = paidUploadCredits > 0
    const canUpload = isFreeUpload || hasPaidCredit || config.canUploadAfterFree

    // Check if user can upload
    if (!canUpload) {
      return NextResponse.json(
        { 
          error: 'You have used all 5 free uploads. Upgrade your plan to upload more.',
          upgradeRequired: true 
        },
        { status: 403 }
      )
    }
    
    // Determine if this is a paid upload using credits
    const isPaidWithCredit = !isFreeUpload && hasPaidCredit

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

    // Calculate upload cost for this upload
    // If user has paid credits, use them (cost is already paid)
    const uploadCost = isFreeUpload || isPaidWithCredit ? 0 : config.costPerUpload

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
        isApproved: true,
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

    // Update free uploads used (for non-Premium plans) or consume paid credit
    let newFreeUploadsUsed = freeUploadsUsed
    let newFreeUploadsRemaining: number | string = freeUploadsRemaining
    let newPaidUploadCredits = paidUploadCredits

    if (user.membershipType !== 'PREMIUM') {
      if (isFreeUpload) {
        // Use a free upload
        newFreeUploadsUsed = freeUploadsUsed + 1
        newFreeUploadsRemaining = Math.max(0, config.freeUploads - newFreeUploadsUsed)
        
        await prisma.user.update({
          where: { id: user.id },
          data: { freeUploadsUsed: newFreeUploadsUsed },
        })
      } else if (isPaidWithCredit) {
        // Consume a paid upload credit
        newPaidUploadCredits = paidUploadCredits - 1
        
        await prisma.user.update({
          where: { id: user.id },
          data: { paidUploadCredits: newPaidUploadCredits },
        })
        
        console.log(`User ${user.id} used paid upload credit. Remaining: ${newPaidUploadCredits}`)
      }
    }

    const totalUploads = (user._count?.media || 0) + 1
    const paidUploadsCount = Math.max(0, totalUploads - config.freeUploads)
    const totalPaidCost = paidUploadsCount * config.costPerUpload
    const planName = `${user.membershipType.charAt(0) + user.membershipType.slice(1).toLowerCase()} Plan`

    // Determine which notification to send
    const userName = user.name || user.username || 'User'
    
    // Check if this upload just exhausted free uploads
    const justExhaustedFreeUploads = newFreeUploadsUsed === config.freeUploads && 
                                      user.membershipType !== 'PREMIUM'

    if (justExhaustedFreeUploads) {
      // Send free uploads exhausted email
      const exhaustedEmailHtml = generateFreeUploadsExhaustedEmail(
        userName,
        planName,
        config.costPerUpload
      )

      await sendEmail({
        to: user.email,
        subject: '⚠️ Free Uploads Exhausted | AI Media Tank',
        html: exhaustedEmailHtml
      })

      // Create in-app notification
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'system',
          title: '⚠️ Free Uploads Exhausted',
          message: config.canUploadAfterFree 
            ? `You have used all 5 free uploads. Future uploads will cost $${config.costPerUpload.toFixed(2)} each.`
            : `You have used all 5 free uploads. Upgrade your plan to continue uploading.`,
          link: '/pricing',
        }
      })
    } else if (isPaidWithCredit) {
      // This upload used a paid credit - send confirmation
      const creditUploadEmailHtml = generateUploadConfirmationEmail(
        userName,
        title,
        totalUploads,
        newPaidUploadCredits > 0 ? `${newPaidUploadCredits} paid credit(s) remaining` : 'No credits remaining',
        false,
        config.costPerUpload,
        planName
      )

      await sendEmail({
        to: user.email,
        subject: '✅ Paid Upload Complete | AI Media Tank',
        html: creditUploadEmailHtml
      })

      // Create in-app notification for paid credit upload
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'system',
          title: '✅ Paid Upload Complete',
          message: `"${title}" uploaded using paid credit. ${newPaidUploadCredits} credit(s) remaining.`,
          link: `/media/${media.id}`,
        }
      })
    } else if (!isFreeUpload && uploadCost > 0) {
      // This is a paid upload - send paid upload notification
      const paidEmailHtml = generatePaidUploadEmail(
        userName,
        title,
        uploadCost,
        paidUploadsCount,
        totalPaidCost
      )

      await sendEmail({
        to: user.email,
        subject: '💳 Paid Upload Processed | AI Media Tank',
        html: paidEmailHtml
      })

      // Create in-app notification for paid upload
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'system',
          title: '💳 Paid Upload',
          message: `Upload charged: $${uploadCost.toFixed(2)}. Total this period: $${totalPaidCost.toFixed(2)}`,
          link: '/pricing',
        }
      })
    } else {
      // Regular free upload - send confirmation
      const freeRemaining = user.membershipType === 'PREMIUM' ? 'Unlimited' : newFreeUploadsRemaining
      
      const confirmationEmailHtml = generateUploadConfirmationEmail(
        userName,
        title,
        totalUploads,
        freeRemaining,
        true,
        0,
        planName
      )

      await sendEmail({
        to: user.email,
        subject: '🎬 Upload Successful! | AI Media Tank',
        html: confirmationEmailHtml
      })

      // Create in-app notification
      const notificationMessage = user.membershipType === 'PREMIUM'
        ? `"${title}" uploaded successfully! Unlimited uploads available.`
        : `"${title}" uploaded! ${newFreeUploadsRemaining} free upload${newFreeUploadsRemaining !== 1 ? 's' : ''} remaining.`

      await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'system',
          title: '🎬 Upload Successful',
          message: notificationMessage,
        }
      })
    }

    // Calculate response info
    const uploadsRemaining = user.membershipType === 'PREMIUM' 
      ? 'Unlimited' 
      : newFreeUploadsRemaining

    return NextResponse.json({ 
      media,
      uploadInfo: {
        isFreeUpload,
        uploadCost,
        freeUploadsUsed: newFreeUploadsUsed,
        freeUploadsRemaining: uploadsRemaining,
        totalUploads,
        paidUploadsCount,
        totalPaidCost,
        message: isFreeUpload 
          ? `✅ Free upload! ${uploadsRemaining} remaining.`
          : `💳 Upload cost: $${uploadCost.toFixed(2)}`
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
