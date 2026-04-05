import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { inspectMediaForAgeRating } from '@/lib/contentInspection'
// Video processing is now handled by Azure Function cron (process-videos)
// import { processMedia } from '@/lib/mediaProcessor'
import { BlobServiceClient } from '@azure/storage-blob'
import { UPLOAD_CONFIG } from '@/lib/uploadPlanConfig'
import {
  generateFreeUploadsExhaustedEmail,
  generatePaidUploadEmail,
  generateUploadConfirmationEmail,
} from '@/lib/uploadEmailTemplates'

export const dynamic = 'force-dynamic'

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

    // Compute new counts for response (same logic as DB updates)
    let newFreeUploadsUsed = freeUploadsUsed
    let newFreeUploadsRemaining: number | string = freeUploadsRemaining
    let newPaidUploadCredits = paidUploadCredits
    let newBonusCredits = bonusCredits
    let newCreditsUsed = creditsUsed
    if (user.membershipType !== 'PREMIUM') {
      if (isFreeUpload) {
        newFreeUploadsUsed = freeUploadsUsed + 1
        newFreeUploadsRemaining = Math.max(0, config.freeUploads - newFreeUploadsUsed)
      } else if (isPaidWithCredit) {
        newCreditsUsed = creditsUsed + 1
        if (bonusCredits > 0) newBonusCredits = bonusCredits - 1
        else newPaidUploadCredits = paidUploadCredits - 1
      }
    }

    // VIDEO: defer "upload successful" email/notification until transcoding completes (see deferredUploadNotifications)
    let videoUploadNotifySource: string | undefined
    if (isVideoUpload) {
      if (isFreeUpload) {
        videoUploadNotifySource = user.membershipType === 'PREMIUM' ? 'premium' : 'free'
      } else if (isPaidWithCredit) {
        videoUploadNotifySource = 'credit'
      } else if (uploadCost > 0) {
        videoUploadNotifySource = 'per_upload'
      } else {
        videoUploadNotifySource = 'free'
      }
    }

    // Atomic: create media + update user counts in one transaction so we never have media without updated counts
    const media = await prisma.$transaction(async (tx) => {
      const created = await tx.media.create({
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
          uploadSuccessNotifySource: videoUploadNotifySource,
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
      if (user.membershipType !== 'PREMIUM') {
        if (isFreeUpload) {
          await tx.user.update({
            where: { id: user.id },
            data: { freeUploadsUsed: newFreeUploadsUsed },
          })
        } else if (isPaidWithCredit) {
          await tx.user.update({
            where: { id: user.id },
            data: {
              bonusCredits: newBonusCredits,
              paidUploadCredits: newPaidUploadCredits,
              creditsUsed: newCreditsUsed,
            },
          })
          if (bonusCredits > 0) {
            console.log(`User ${user.id} used bonus credit. Remaining bonus: ${newBonusCredits}`)
          } else {
            console.log(`User ${user.id} used paid upload credit. Remaining: ${newPaidUploadCredits}`)
          }
        }
      }
      return created
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
        await prisma.$executeRaw`
          UPDATE "Media"
          SET "fileSize" = ${BigInt(Math.trunc(size))}
          WHERE "id" = ${media.id}
        `
      }
    } catch (e) {
      console.error('Failed to persist fileSize on upload:', e)
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

    // Fire-and-forget: send email + notification in background.
    // Must attach .catch() so an unhandled rejection does not crash the process (e.g. under azure-run.js).
    const backgroundTasks = async () => {
      try {
        const userName = user.name || user.username || 'User'
        const deferVideoSuccessNotify = isVideoUpload
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
          if (!deferVideoSuccessNotify) {
            const remainingCredits = newPaidUploadCredits + newBonusCredits
            const creditUploadEmailHtml = generateUploadConfirmationEmail(
              userName, title, totalUploads,
              `${remainingCredits} credit${remainingCredits !== 1 ? 's' : ''}`,
              true, 0, planName
            )
            await sendEmail({ to: user.email, subject: '✅ Upload Complete (Credit Used) | AI Media Tank', html: creditUploadEmailHtml })
            await prisma.notification.create({
              data: {
                userId: user.id, type: 'system', title: '✅ Upload Complete (Credit Used)',
                message: `"${title}" uploaded using credit. ${remainingCredits} credit${remainingCredits !== 1 ? 's' : ''} remaining.`,
                link: `/media/${media.id}`,
              }
            })
          }
        } else if (!isFreeUpload && uploadCost > 0) {
          if (!deferVideoSuccessNotify) {
            const paidEmailHtml = generatePaidUploadEmail(userName, title, uploadCost, paidUploadsCount, totalPaidCost)
            await sendEmail({ to: user.email, subject: '💳 Paid Upload Processed | AI Media Tank', html: paidEmailHtml })
            await prisma.notification.create({
              data: {
                userId: user.id, type: 'system', title: '💳 Paid Upload',
                message: `Upload charged: $${uploadCost.toFixed(2)}. Total this period: $${totalPaidCost.toFixed(2)}`,
                link: '/pricing',
              }
            })
          }
        } else {
          if (!deferVideoSuccessNotify) {
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
        }

        // Automatic content inspection for age rating: if review needed, mark media and notify admins
        try {
          const inspection = await inspectMediaForAgeRating({ title: media.title, description: media.description ?? undefined })
          if (inspection.status === 'review') {
            await prisma.media.update({
              where: { id: media.id },
              data: {
                contentInspectionStatus: 'review',
                contentInspectionAlertAt: new Date(),
                contentInspectionSummary: inspection.summary ?? 'Content may need age rating review.',
              },
            })
            const admins = await prisma.user.findMany({
              where: { role: 'ADMIN' },
              select: { id: true },
            })
            const safeTitle = (media.title || 'Untitled').slice(0, 80)
            for (const admin of admins) {
              await prisma.notification.create({
                data: {
                  userId: admin.id,
                  type: 'system',
                  title: '⚠️ Age rating review',
                  message: `Media "${safeTitle}" may need age rating review. Check Admin → Media.`,
                  link: '/admin?tab=media',
                },
              })
            }
          } else {
            await prisma.media.update({
              where: { id: media.id },
              data: { contentInspectionStatus: 'pass' },
            })
          }
        } catch (inspectionErr) {
          console.error('Content inspection failed:', inspectionErr)
          // Leave status as "pending" so cron or manual re-run can retry
        }
      } catch (e) {
        console.error('Background email/notification failed:', e)
      }
    }

    // Start background tasks without awaiting; .catch() prevents unhandledRejection → process exit in production
    backgroundTasks().catch((e) => {
      console.error('Background tasks promise rejected:', e)
    })

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
