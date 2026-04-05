import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { UPLOAD_CONFIG } from '@/lib/uploadPlanConfig'
import {
  generateGenericVideoLiveEmail,
  generatePaidUploadEmail,
  generateStripeUploadFeeCompleteEmail,
  generateUploadConfirmationEmail,
} from '@/lib/uploadEmailTemplates'

/**
 * After server-side video processing completes, the home feed can show the item.
 * Send the same user-facing success email + in-app notification that we used to send
 * right after blob upload / Stripe checkout (which was wrong while processing could still fail).
 */
export async function notifyUploadLiveAfterVideoProcessing(mediaId: string): Promise<void> {
  try {
    const media = await prisma.media.findFirst({
      where: {
        id: mediaId,
        type: 'VIDEO',
        processingStatus: 'completed',
        uploadLiveNotifiedAt: null,
      },
      select: {
        id: true,
        title: true,
        userId: true,
        uploadSuccessNotifySource: true,
        type: true,
      },
    })

    if (!media || media.type !== 'VIDEO') return

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

    if (!user?.email) {
      console.warn(`[DeferredUploadNotify] No email for user ${media.userId}, skip`)
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
      switch (source) {
        case 'stripe_fee': {
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
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'system',
              title: '🎉 Upload Complete!',
              message: `Your paid upload "${media.title}" is now live!`,
              link: `/media/${media.id}`,
            },
          })
          break
        }
        case 'credit': {
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
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'system',
              title: '✅ Upload Complete (Credit Used)',
              message: `"${media.title}" uploaded using credit. ${remainingCredits} credit${remainingCredits !== 1 ? 's' : ''} remaining.`,
              link: `/media/${media.id}`,
            },
          })
          break
        }
        case 'per_upload': {
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
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'system',
              title: '💳 Paid Upload',
              message: `Upload charged: $${uploadCost.toFixed(2)}. Total this period: $${totalPaidCost.toFixed(2)}`,
              link: '/pricing',
            },
          })
          break
        }
        case 'free':
        case 'premium': {
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
          break
        }
        default: {
          const html = generateGenericVideoLiveEmail(userName, media.title, media.id)
          await sendEmail({
            to: user.email,
            subject: `🎬 Your video is ready: "${media.title}" | AI Media Tank`,
            html,
          })
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'system',
              title: '🎬 Your video is ready',
              message: `"${media.title}" finished processing and appears on the home feed.`,
              link: `/media/${media.id}`,
            },
          })
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
