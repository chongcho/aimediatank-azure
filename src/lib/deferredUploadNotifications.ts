import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { wherePublicHomeFeedVisible } from '@/lib/homeFeedVisibility'
import { UPLOAD_CONFIG } from '@/lib/uploadPlanConfig'
import {
  generateGenericVideoLiveEmail,
  generatePaidUploadEmail,
  generateStripeUploadFeeCompleteEmail,
  generateUploadConfirmationEmail,
} from '@/lib/uploadEmailTemplates'

/** Match stored type regardless of casing (defensive) */
const VIDEO_TYPE_FILTER = { equals: 'VIDEO' as const, mode: 'insensitive' as const }

/** In-app titles written by this flow — used to avoid duplicates when email fails and cron retries */
const LIVE_UPLOAD_NOTIFY_TITLES = [
  '🎉 Upload Complete!',
  '✅ Upload Complete (Credit Used)',
  '💳 Paid Upload',
  '🎬 Upload Successful',
  '🎬 Your video is ready',
] as const

type LiveEmailPayload = { subject: string; html: string }

const BACKFILL_MAX_PER_TICK = 15

/**
 * Videos that would appear on the public home feed (same rule as GET /api/media) but have not been
 * "live" notified yet — send deferred in-app + email. Runs in short cron requests.
 */
export async function backfillMissedUploadLiveNotification(): Promise<{
  backfilled: boolean
  backfilledCount: number
  mediaIds: string[]
}> {
  const mediaIds: string[] = []
  try {
    for (let i = 0; i < BACKFILL_MAX_PER_TICK; i++) {
      const row = await prisma.media.findFirst({
        where: {
          ...wherePublicHomeFeedVisible(),
          type: VIDEO_TYPE_FILTER,
          uploadLiveNotifiedAt: null,
        },
        orderBy: { updatedAt: 'asc' },
        select: { id: true },
      })
      if (!row) break
      await notifyUploadLiveAfterVideoProcessing(row.id)
      mediaIds.push(row.id)
    }
    return {
      backfilled: mediaIds.length > 0,
      backfilledCount: mediaIds.length,
      mediaIds,
    }
  } catch (e) {
    console.error('[DeferredUploadNotify] backfillMissedUploadLiveNotification failed:', e)
    return { backfilled: false, backfilledCount: 0, mediaIds }
  }
}

/**
 * When the item is eligible for the public home feed (completed or processing-with-preview, same as
 * GET /api/media), send deferred in-app + email. uploadLiveNotifiedAt only after email succeeds
 * (or no email on account).
 */
export async function notifyUploadLiveAfterVideoProcessing(mediaId: string): Promise<void> {
  try {
    const media = await prisma.media.findFirst({
      where: {
        id: mediaId,
        ...wherePublicHomeFeedVisible(),
        type: VIDEO_TYPE_FILTER,
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
        `[DeferredUploadNotify] Skip live notify for ${mediaId}: not found, not a video, not public home-feed visible yet, or already notified`
      )
      return
    }

    // Only users who went through deferred video upload flow have uploadSuccessNotifySource set at
    // create time. Legacy / imported media must not get "your video is ready" backfill emails.
    const notifySource = media.uploadSuccessNotifySource?.trim()
    if (!notifySource) {
      await prisma.media.update({
        where: { id: mediaId },
        data: { uploadLiveNotifiedAt: new Date() },
      })
      console.log(
        `[DeferredUploadNotify] Skip live notify for ${mediaId}: no uploadSuccessNotifySource (legacy/non-upload path); marked notified without email`
      )
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: media.userId },
      select: {
        id: true,
        email: true,
        role: true,
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

    const source = notifySource
    let mail: LiveEmailPayload | null = null

    const mediaLink = `/media/${media.id}`
    const hasInAppLiveNotify = await prisma.notification.findFirst({
      where: {
        userId: user.id,
        type: 'system',
        link: mediaLink,
        title: { in: [...LIVE_UPLOAD_NOTIFY_TITLES] },
      },
      select: { id: true },
    })

    try {
      switch (source) {
        case 'stripe_fee': {
          if (!hasInAppLiveNotify) {
            await prisma.notification.create({
              data: {
                userId: user.id,
                type: 'system',
                title: '🎉 Upload Complete!',
                message: `Your paid upload "${media.title}" is now live!`,
                link: mediaLink,
              },
            })
          }
          mail = {
            subject: `🎉 Upload Complete: "${media.title}" | AI Media Tank`,
            html: generateStripeUploadFeeCompleteEmail(userName, media.title, 'VIDEO', stripeFee, media.id),
          }
          break
        }
        case 'credit': {
          if (!hasInAppLiveNotify) {
            await prisma.notification.create({
              data: {
                userId: user.id,
                type: 'system',
                title: '✅ Upload Complete (Credit Used)',
                message: `"${media.title}" uploaded using credit. ${remainingCredits} credit${remainingCredits !== 1 ? 's' : ''} remaining.`,
                link: mediaLink,
              },
            })
          }
          mail = {
            subject: '✅ Upload Complete (Credit Used) | AI Media Tank',
            html: generateUploadConfirmationEmail(
              userName,
              media.title,
              totalUploads,
              `${remainingCredits} credit${remainingCredits !== 1 ? 's' : ''}`,
              true,
              0,
              planName
            ),
          }
          break
        }
        case 'per_upload': {
          if (!hasInAppLiveNotify) {
            await prisma.notification.create({
              data: {
                userId: user.id,
                type: 'system',
                title: '💳 Paid Upload',
                message: `Upload charged: $${uploadCost.toFixed(2)}. Total this period: $${totalPaidCost.toFixed(2)}`,
                link: mediaLink,
              },
            })
          }
          mail = {
            subject: '💳 Paid Upload Processed | AI Media Tank',
            html: generatePaidUploadEmail(userName, media.title, uploadCost, paidUploadsCount, totalPaidCost),
          }
          break
        }
        case 'free':
        case 'premium': {
          const notificationMessage =
            user.membershipType === 'PREMIUM'
              ? `"${media.title}" uploaded successfully! Unlimited uploads available.`
              : `"${media.title}" uploaded! ${newFreeUploadsRemaining} free upload${newFreeUploadsRemaining !== 1 ? 's' : ''} remaining.`
          if (!hasInAppLiveNotify) {
            await prisma.notification.create({
              data: {
                userId: user.id,
                type: 'system',
                title: '🎬 Upload Successful',
                message: notificationMessage,
                link: mediaLink,
              },
            })
          }
          const freeRemaining =
            user.membershipType === 'PREMIUM' ? 'Unlimited' : newFreeUploadsRemaining
          mail = {
            subject: '🎬 Upload Successful! | AI Media Tank',
            html: generateUploadConfirmationEmail(
              userName,
              media.title,
              totalUploads,
              freeRemaining,
              true,
              0,
              planName
            ),
          }
          break
        }
        default: {
          if (!hasInAppLiveNotify) {
            await prisma.notification.create({
              data: {
                userId: user.id,
                type: 'system',
                title: '🎬 Your video is ready',
                message: `"${media.title}" finished processing and appears on the home feed.`,
                link: mediaLink,
              },
            })
          }
          mail = {
            subject: `🎬 Your video is ready: "${media.title}" | AI Media Tank`,
            html: generateGenericVideoLiveEmail(userName, media.title, media.id),
          }
        }
      }

      const addr = user.email?.trim()
      if (mail && addr) {
        try {
          const sent = await sendEmail({ to: addr, subject: mail.subject, html: mail.html })
          if (!sent) {
            console.warn(
              `[DeferredUploadNotify] ACS did not send mail media=${mediaId} user=${user.id} role=${user.role ?? 'n/a'} to=${addr} — ` +
                `uploadLiveNotifiedAt left null for cron backfill. Check AZURE_EMAIL_* on the app that runs process-videos.`
            )
            return
          }
        } catch (err) {
          console.error(`[DeferredUploadNotify] Email error media=${mediaId} user=${user.id}`, err)
          return
        }
      } else if (mail && !addr) {
        console.warn(
          `[DeferredUploadNotify] media=${mediaId} user=${user.id} role=${user.role ?? 'n/a'}: no email on account — in-app only; marking notified`
        )
      }

      await prisma.media.update({
        where: { id: mediaId },
        data: { uploadLiveNotifiedAt: new Date() },
      })
      console.log(
        `[DeferredUploadNotify] Live notify complete media=${mediaId} source=${source ?? 'unknown'} user=${user.id} role=${user.role ?? 'n/a'} email=${addr ? 'sent' : 'skipped'}`
      )
    } catch (e) {
      console.error(`[DeferredUploadNotify] Failed to notify for media ${mediaId}:`, e)
    }
  } catch (e) {
    console.error(`[DeferredUploadNotify] Error in notifyUploadLiveAfterVideoProcessing:`, e)
  }
}
