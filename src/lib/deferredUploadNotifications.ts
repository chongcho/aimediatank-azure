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

type LiveEmailPayload = { subject: string; html: string }

/**
 * Do not await ACS — pollUntilDone() can hang and would block uploadLiveNotifiedAt + invite cron backfill spam.
 * Log clearly when staging has no AZURE_EMAIL_CONNECTION_STRING (sendEmail returns false without throwing).
 */
function queueLiveEmail(mediaId: string, userId: string, role: string | null, to: string | null | undefined, mail: LiveEmailPayload | null) {
  if (!mail) return
  const addr = to?.trim()
  if (!addr) {
    console.warn(
      `[DeferredUploadNotify] media=${mediaId} user=${userId} role=${role ?? 'n/a'}: in-app sent; no email address — skipped mail`
    )
    return
  }
  void (async () => {
    try {
      const sent = await sendEmail({ to: addr, subject: mail.subject, html: mail.html })
      if (!sent) {
        console.warn(
          `[DeferredUploadNotify] ACS did not send mail media=${mediaId} user=${userId} role=${role ?? 'n/a'} to=${addr} — ` +
            `if this is staging, set AZURE_EMAIL_CONNECTION_STRING (and verified AZURE_EMAIL_SENDER) on the web app; admin uploads use the same path as any user`
        )
      }
    } catch (err) {
      console.error(`[DeferredUploadNotify] Email error media=${mediaId} user=${userId}`, err)
    }
  })()
}

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
 * In-app notification + uploadLiveNotifiedAt first; email queued async (same behavior for all roles, including ADMIN).
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

    const source = media.uploadSuccessNotifySource
    let mail: LiveEmailPayload | null = null

    try {
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
          mail = {
            subject: `🎉 Upload Complete: "${media.title}" | AI Media Tank`,
            html: generateStripeUploadFeeCompleteEmail(userName, media.title, 'VIDEO', stripeFee, media.id),
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
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'system',
              title: '💳 Paid Upload',
              message: `Upload charged: $${uploadCost.toFixed(2)}. Total this period: $${totalPaidCost.toFixed(2)}`,
              link: '/pricing',
            },
          })
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
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'system',
              title: '🎬 Upload Successful',
              message: notificationMessage,
              link: `/media/${media.id}`,
            },
          })
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
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'system',
              title: '🎬 Your video is ready',
              message: `"${media.title}" finished processing and appears on the home feed.`,
              link: `/media/${media.id}`,
            },
          })
          mail = {
            subject: `🎬 Your video is ready: "${media.title}" | AI Media Tank`,
            html: generateGenericVideoLiveEmail(userName, media.title, media.id),
          }
        }
      }

      await prisma.media.update({
        where: { id: mediaId },
        data: { uploadLiveNotifiedAt: new Date() },
      })
      console.log(
        `[DeferredUploadNotify] In-app + marked notified media=${mediaId} source=${source ?? 'unknown'} user=${user.id} role=${user.role ?? 'n/a'}`
      )

      queueLiveEmail(mediaId, user.id, user.role, user.email, mail)
    } catch (e) {
      console.error(`[DeferredUploadNotify] Failed to notify for media ${mediaId}:`, e)
    }
  } catch (e) {
    console.error(`[DeferredUploadNotify] Error in notifyUploadLiveAfterVideoProcessing:`, e)
  }
}
