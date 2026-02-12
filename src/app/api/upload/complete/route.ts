import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
// Video processing is now handled by Azure Function cron (process-videos)
// import { processMedia } from '@/lib/mediaProcessor'
import { BlobServiceClient } from '@azure/storage-blob'

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

function getAzureBlobClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not defined')
  }
  return BlobServiceClient.fromConnectionString(connectionString)
}

async function tryGetSizeViaHead(url: string): Promise<number | null> {
  const raw = (url || '').trim()
  if (!raw) return null
  try {
    const res = await fetch(raw, { method: 'HEAD', redirect: 'follow' })
    if (!res.ok) return null
    const cl = res.headers.get('content-length')
    if (!cl) return null
    const n = Number(cl)
    if (!Number.isFinite(n) || n < 0) return null
    return n
  } catch {
    return null
  }
}

function parseAzureUrl(input: string): { containerName: string; blobName: string } | null {
  const containerFromEnv = process.env.AZURE_STORAGE_CONTAINER_NAME || 'media'
  const raw = (input || '').trim()
  if (!raw) return null

  // 1) Full URL (typical): https://<acct>.blob.core.windows.net/<container>/<blob>
  // 2) CDN/custom domain URL (sometimes): https://cdn.example.com/<blob> (no container segment)
  try {
    const u = new URL(raw)
    const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean)
    if (parts.length >= 2) {
      return { containerName: parts[0], blobName: parts.slice(1).join('/') }
    }
    if (parts.length === 1) {
      return { containerName: containerFromEnv, blobName: parts[0] }
    }
    return null
  } catch {
    // Not a URL: fall through
  }

  // Allow passing a blob name or path (e.g. "uuid.mp4", "/media/uuid.mp4", "media/uuid.mp4", "uploads/uuid.mp4")
  const noQuery = raw.split('?')[0]
  const path = noQuery.replace(/^\/+/, '')
  if (!path) return null
  const parts = path.split('/').filter(Boolean)

  // Only treat first segment as container if it matches our expected container name.
  if (parts.length >= 2 && parts[0] && parts[0].toLowerCase() === containerFromEnv.toLowerCase()) {
    return { containerName: parts[0], blobName: parts.slice(1).join('/') }
  }

  return { containerName: containerFromEnv, blobName: parts.join('/') }
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

    const config = UPLOAD_CONFIG[user.membershipType] || UPLOAD_CONFIG.VIEWER
    const freeUploadsUsed = user.freeUploadsUsed || 0
    const paidUploadCredits = user.paidUploadCredits || 0
    const bonusCredits = user.bonusCredits || 0
    const creditsUsed = user.creditsUsed || 0
    const totalCredits = paidUploadCredits + bonusCredits
    const freeUploadsRemaining = user.membershipType === 'PREMIUM' 
      ? Infinity 
      : Math.max(0, config.freeUploads - freeUploadsUsed)
    
    const isFreeUpload = freeUploadsRemaining > 0 || user.membershipType === 'PREMIUM'
    const hasPaidCredit = totalCredits > 0
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
      realDevice,
      aiPrompt,
      price,
      isPublic = true,
      cropData,   // { x, y, width, height } from crop tool — applied server-side by FFmpeg
      trimStart,  // video trim start (seconds)
      trimEnd,    // video trim end (seconds)
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

    // For VIDEO uploads, server-side FFmpeg processing will create 720p + HQ versions.
    // Set processingStatus to 'pending' so the UI shows a "Processing…" indicator.
    const isVideoUpload = type === 'VIDEO'

    // Create media record
    const media = await prisma.media.create({
      data: {
        title,
        description: description || '',
        type: type as 'VIDEO' | 'IMAGE' | 'MUSIC',
        url,
        thumbnailUrl: thumbnailUrl || null,
        aiTool: aiTool || null,
        realDevice: realDevice || null,
        aiPrompt: aiPrompt || null,
        price: price ? parseFloat(price) : null,
        isPublic,
        isApproved: true,
        userId: session.user.id,
        processingStatus: isVideoUpload ? 'pending' : 'completed',
        cropData: isVideoUpload && cropData ? cropData : undefined,
        trimStart: isVideoUpload && (typeof trimStart === 'number' || typeof trimStart === 'string') && !Number.isNaN(Number(trimStart)) && Number(trimStart) >= 0 ? Number(trimStart) : undefined,
        trimEnd: isVideoUpload && (typeof trimEnd === 'number' || typeof trimEnd === 'string') && !Number.isNaN(Number(trimEnd)) && Number(trimEnd) > 0 ? Number(trimEnd) : undefined,
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

    // Best-effort: persist fileSize once at upload time (do not block upload if Azure is unavailable)
    try {
      let size: number | null = null

      // Prefer Azure SDK when available.
      try {
        const parsed = parseAzureUrl(url)
        if (parsed) {
          const blobServiceClient = getAzureBlobClient()
          const containerClient = blobServiceClient.getContainerClient(parsed.containerName)
          const blobClient = containerClient.getBlobClient(parsed.blobName)
          const props = await blobClient.getProperties()
          if (typeof props.contentLength === 'number' && Number.isFinite(props.contentLength) && props.contentLength >= 0) {
            size = props.contentLength
          }
        }
      } catch (e) {
        // Fall through to HEAD-based approach
        console.error('Azure SDK getProperties failed:', e)
      }

      // Fallback: HEAD request against the stored URL (works if URL is publicly reachable).
      if (size === null) {
        size = await tryGetSizeViaHead(url)
      }

      if (typeof size === 'number' && Number.isFinite(size) && size >= 0) {
        // Use raw SQL to avoid Prisma client type drift in some environments
        await prisma.$executeRaw`
          UPDATE "Media"
          SET "fileSize" = ${BigInt(Math.trunc(size))}
          WHERE "id" = ${media.id}
        `
      }
    } catch (e) {
      console.error('Failed to persist fileSize on upload:', e)
    }

    // Update free uploads used (for non-Premium plans) or consume paid credit
    let newFreeUploadsUsed = freeUploadsUsed
    let newFreeUploadsRemaining: number | string = freeUploadsRemaining
    let newPaidUploadCredits = paidUploadCredits
    let newBonusCredits = bonusCredits
    let newCreditsUsed = creditsUsed

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
        // Consume a credit (bonus credits first, then paid credits)
        newCreditsUsed = creditsUsed + 1
        
        if (bonusCredits > 0) {
          // Use bonus credit first
          newBonusCredits = bonusCredits - 1
          await prisma.user.update({
            where: { id: user.id },
            data: { 
              bonusCredits: newBonusCredits,
              creditsUsed: newCreditsUsed,
            },
          })
          console.log(`User ${user.id} used bonus credit. Remaining bonus: ${newBonusCredits}`)
        } else {
          // Use paid credit
          newPaidUploadCredits = paidUploadCredits - 1
          await prisma.user.update({
            where: { id: user.id },
            data: { 
              paidUploadCredits: newPaidUploadCredits,
              creditsUsed: newCreditsUsed,
            },
          })
          console.log(`User ${user.id} used paid upload credit. Remaining: ${newPaidUploadCredits}`)
        }
      }
    }

    const totalUploads = (user._count?.media || 0) + 1
    const paidUploadsCount = Math.max(0, totalUploads - config.freeUploads)
    const totalPaidCost = paidUploadsCount * config.costPerUpload
    const planName = `${user.membershipType.charAt(0) + user.membershipType.slice(1).toLowerCase()} Plan`

    // Calculate response info
    const uploadsRemaining = user.membershipType === 'PREMIUM' 
      ? 'Unlimited' 
      : newFreeUploadsRemaining

    // Return response immediately — send emails & notifications in background
    // (fire-and-forget so the client progress bar completes without waiting for SMTP)
    const response = NextResponse.json({ 
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

    // Fire-and-forget: send email + notification in background
    const backgroundTasks = async () => {
      try {
        const userName = user.name || user.username || 'User'
        const justExhaustedFreeUploads = isFreeUpload && 
                                          newFreeUploadsUsed === config.freeUploads && 
                                          user.membershipType !== 'PREMIUM'

        if (justExhaustedFreeUploads) {
          const exhaustedEmailHtml = generateFreeUploadsExhaustedEmail(userName, planName, config.costPerUpload)
          await sendEmail({ to: user.email, subject: '⚠️ Free Uploads Exhausted | AI Media Tank', html: exhaustedEmailHtml })
          await prisma.notification.create({
            data: {
              userId: user.id, type: 'system', title: '⚠️ Free Uploads Exhausted',
              message: config.canUploadAfterFree 
                ? `You have used all 5 free uploads. Future uploads will cost $${config.costPerUpload.toFixed(2)} each.`
                : `You have used all 5 free uploads. Upgrade your plan to continue uploading.`,
              link: '/pricing',
            }
          })
        } else if (isPaidWithCredit) {
          const creditUploadEmailHtml = generateUploadConfirmationEmail(
            userName, title, totalUploads,
            newPaidUploadCredits > 0 ? `${newPaidUploadCredits} paid credit(s) remaining` : 'No credits remaining',
            false, config.costPerUpload, planName
          )
          await sendEmail({ to: user.email, subject: '✅ Paid Upload Complete | AI Media Tank', html: creditUploadEmailHtml })
          await prisma.notification.create({
            data: {
              userId: user.id, type: 'system', title: '✅ Paid Upload Complete',
              message: `"${title}" uploaded using paid credit. ${newPaidUploadCredits} credit(s) remaining.`,
              link: `/media/${media.id}`,
            }
          })
        } else if (!isFreeUpload && uploadCost > 0) {
          const paidEmailHtml = generatePaidUploadEmail(userName, title, uploadCost, paidUploadsCount, totalPaidCost)
          await sendEmail({ to: user.email, subject: '💳 Paid Upload Processed | AI Media Tank', html: paidEmailHtml })
          await prisma.notification.create({
            data: {
              userId: user.id, type: 'system', title: '💳 Paid Upload',
              message: `Upload charged: $${uploadCost.toFixed(2)}. Total this period: $${totalPaidCost.toFixed(2)}`,
              link: '/pricing',
            }
          })
        } else {
          const freeRemaining = user.membershipType === 'PREMIUM' ? 'Unlimited' : newFreeUploadsRemaining
          const confirmationEmailHtml = generateUploadConfirmationEmail(userName, title, totalUploads, freeRemaining, true, 0, planName)
          await sendEmail({ to: user.email, subject: '🎬 Upload Successful! | AI Media Tank', html: confirmationEmailHtml })
          const notificationMessage = user.membershipType === 'PREMIUM'
            ? `"${title}" uploaded successfully! Unlimited uploads available.`
            : `"${title}" uploaded! ${newFreeUploadsRemaining} free upload${newFreeUploadsRemaining !== 1 ? 's' : ''} remaining.`
          await prisma.notification.create({
            data: { userId: user.id, type: 'system', title: '🎬 Upload Successful', message: notificationMessage }
          })
        }
      } catch (e) {
        console.error('Background email/notification failed:', e)
      }
    }

    // Start background tasks without awaiting — they run after response is sent
    backgroundTasks()

    // Video processing is now handled by Azure Function (process-videos timer)
    // which calls /api/cron/process-videos every minute.
    // The media record is already created with processingStatus='pending',
    // so the cron will pick it up automatically — no fire-and-forget needed here.

    return response
  } catch (error) {
    console.error('Error completing upload:', error)
    return NextResponse.json(
      { error: 'Failed to complete upload' },
      { status: 500 }
    )
  }
}
