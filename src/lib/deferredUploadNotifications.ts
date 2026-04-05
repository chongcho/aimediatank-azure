import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { UPLOAD_CONFIG } from '@/lib/uploadPlanConfig'
import {
  generateGenericVideoLiveEmail,
  generatePaidUploadEmail,
  generateStripeUploadFeeCompleteEmail,
  generateUploadConfirmationEmail,
} from '@/lib/uploadEmailTemplates'

/** Match stored type regardless of casing (defensive) */
const VIDEO_TYPE_FILTER = { equals: 'VIDEO' as const, mode: 'insensitive' as const }

/**
 * Pick one completed video that never received the deferred "live" notify (email + in-app).
 * Called from process-videos cron so missed/failed first attempts are repaired within ~1 minute.
 */
export async function backfillMissedUploadLiveNotification(): Promise<{
  backfilled: boolean
  mediaId?: string
}> {
  try {
    const row = await prisma.media.findFirst({
      where: {
        type: VIDEO_TYPE_FILTER,
        processingStatus: 'completed',
        uploadLiveNotifiedAt: null,
      },
      orderBy: { updatedAt: 'asc' },
      select: { id: true },
    })
    if (!row) return { backfilled: false }
    await notifyUploadLiveAfterVideoProcessing(row.id)
    return { backfilled: true, mediaId: row.id }
  } catch (e) {
    console.error('[DeferredUploadNotify] backfillMissedUploadLiveNotification failed:', e)
    return { backfilled: false }
  }
}

/**
 * After server-side video processing completes, the home feed can show the item.
 * Send in-app notification first (always), then email when configured — email polling must not block the bell icon.
 */
export async function notifyUploadLiveAfterVideoProcessing(mediaId: string): Promise<void> {
  try {
    const media = await prisma.media.findFirst({
      where: {
        id: mediaId,
        type: VIDEO_TYPE_FILTER,
        processingStatus: 'completed',
        uploadLiveNotifiedAt: null,
      },
      select: {
        id: true,
        title: true,
        userId: true,
        uploadSuccessNotifySource: true,
      },
    })

    if (!media) {
      console.warn(
        `[DeferredUploadNotify] Skip live notify for ${mediaId}: not found, not a video, not completed, or already notified`
      )
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: media.userId },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        membershipType: true,
        freeUploadsUsed: true,
        paidUploadCredits: true,
        bonusCredits: true,
        creditsUsed: true,
        _count: { select: { media: true } },
      },
    })

    if (!user) {
      console.warn(`[DeferredUploadNotify] User ${media.userId} missing, skip live notify for media ${mediaId}`)
      return
    }

    const config = UPLOAD_CONFIG[user.membershipType] || UPLOAD_CONFIG.VIEWER
    const planName = `${user.membershipType.charAt(0) + user.membershipType.slice(1).toLowerCase()} Plan`
    const userName = user.name || user.username || 'User'
    const totalUploads = user._count?.media || 0
    const paidUploadsCount = Math.max(0, totalUploads - config.freeUploads)
    const totalPaidCost = paidUploadsCount * config.costPerUpload
    const freeUploadsUsed = user.freeUploadsUsed || 0
    const newFreeUploadsRemaining =
      user.membershipType === 'PREMIUM'
        ? 'Unlimited'
        : Math.max(0, config.freeUploads - freeUploadsUsed)
    const paidUploadCredits = user.paidUploadCredits || 0
    const bonusCredits = user.bonusCredits || 0
    const remainingCredits = paidUploadCredits + bonusCredits
    const uploadCost = config.costPerUpload
    const stripeFee = user.membershipType === 'ADVANCED' ? 0.5 : 1.0

    const source = media.uploadSuccessNotifySource

    try {
      // In-app first so a slow/hung email client never blocks the user-visible notification
      switch (source) {
        case 'stripe_fee': {
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'system',
              title: '🎉 Upload Complete!',
              message: `Your paid upload "${media.title}" is now live!`,
              link: `/media/${media.id}`,
            },
          })
          if (user.email) {
            const html = generateStripeUploadFeeCompleteEmail(
              userName,
              media.title,
              'VIDEO',
              stripeFee,
              media.id
            )
            await sendEmail({
              to: user.email,
              subject: `🎉 Upload Complete: "${media.title}" | AI Media Tank`,
              html,
            })
          }
          break
        }
        case 'credit': {
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'system',
              title: '✅ Upload Complete (Credit Used)',
              message: `"${media.title}" uploaded using credit. ${remainingCredits} credit${remainingCredits !== 1 ? 's' : ''} remaining.`,
              link: `/media/${media.id}`,
            },
          })
          if (user.email) {
            const creditUploadEmailHtml = generateUploadConfirmationEmail(
              userName,
              media.title,
              totalUploads,
              `${remainingCredits} credit${remainingCredits !== 1 ? 's' : ''}`,
              true,
              0,
              planName
            )
            await sendEmail({
              to: user.email,
              subject: '✅ Upload Complete (Credit Used) | AI Media Tank',
              html: creditUploadEmailHtml,
            })
          }
          break
        }
        case 'per_upload': {
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'system',
              title: '💳 Paid Upload',
              message: `Upload charged: $${uploadCost.toFixed(2)}. Total this period: $${totalPaidCost.toFixed(2)}`,
              link: '/pricing',
            },
          })
          if (user.email) {
            const paidEmailHtml = generatePaidUploadEmail(
              userName,
              media.title,
              uploadCost,
              paidUploadsCount,
              totalPaidCost
            )
            await sendEmail({
              to: user.email,
              subject: '💳 Paid Upload Processed | AI Media Tank',
              html: paidEmailHtml,
            })
          }
          break
        }
        case 'free':
        case 'premium': {
          const notificationMessage =
            user.membershipType === 'PREMIUM'
              ? `"${media.title}" uploaded successfully! Unlimited uploads available.`
              : `"${media.title}" uploaded! ${newFreeUploadsRemaining} free upload${newFreeUploadsRemaining !== 1 ? 's' : ''} remaining.`
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'system',
              title: '🎬 Upload Successful',
              message: notificationMessage,
              link: `/media/${media.id}`,
            },
          })
          if (user.email) {
            const freeRemaining =
              user.membershipType === 'PREMIUM' ? 'Unlimited' : newFreeUploadsRemaining
            const confirmationEmailHtml = generateUploadConfirmationEmail(
              userName,
              media.title,
              totalUploads,
              freeRemaining,
              true,
              0,
              planName
            )
            await sendEmail({
              to: user.email,
              subject: '🎬 Upload Successful! | AI Media Tank',
              html: confirmationEmailHtml,
            })
          }
          break
        }
        default: {
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'system',
              title: '🎬 Your video is ready',
              message: `"${media.title}" finished processing and appears on the home feed.`,
              link: `/media/${media.id}`,
            },
          })
          if (user.email) {
            const html = generateGenericVideoLiveEmail(userName, media.title, media.id)
            await sendEmail({
              to: user.email,
              subject: `🎬 Your video is ready: "${media.title}" | AI Media Tank`,
              html,
            })
          }
        }
      }

      await prisma.media.update({
        where: { id: mediaId },
        data: { uploadLiveNotifiedAt: new Date() },
      })
      console.log(`[DeferredUploadNotify] Sent live notification for media ${mediaId} (source=${source ?? 'unknown'})`)
    } catch (e) {
      console.error(`[DeferredUploadNotify] Failed to notify for media ${mediaId}:`, e)
    }
  } catch (e) {
    console.error(`[DeferredUploadNotify] Error in notifyUploadLiveAfterVideoProcessing:`, e)
  }
}
