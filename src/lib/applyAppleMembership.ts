import { prisma } from '@/lib/prisma'
import { buildMembershipPlanChangeCreditUpdate } from '@/lib/uploadPlanConfig'
import {
  membershipPlanDisplayName,
  type AppleBillingPeriod,
  type AppleMembershipPlanId,
} from '@/lib/appleIapCatalog'

const PLAN_UPLOAD_BLURB: Record<string, string> = {
  basic: 'monthly free uploads — upgrade membership to continue after the limit',
  advanced: 'monthly free uploads — upgrade membership to continue after the limit',
  premium: 'unlimited free uploads',
}

export async function applyAppleMembershipEntitlement(params: {
  userId: string
  planId: AppleMembershipPlanId
  billingPeriod: AppleBillingPeriod
  originalTransactionId: string
  productId: string
  /** ms epoch from Apple; fallback computed from billing period */
  expiresDateMs?: number
  sendNotifications?: boolean
}): Promise<{ membershipType: string; membershipExpiresAt: Date }> {
  const membershipType = params.planId.toUpperCase()
  const periodEnd = params.expiresDateMs
    ? new Date(params.expiresDateMs)
    : (() => {
        const d = new Date()
        if (params.billingPeriod === 'year') d.setFullYear(d.getFullYear() + 1)
        else d.setMonth(d.getMonth() + 1)
        return d
      })()

  const existing = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { membershipType: true, freeUploadsUsed: true },
  })
  const creditUpdate = await buildMembershipPlanChangeCreditUpdate(
    existing?.membershipType,
    existing?.freeUploadsUsed,
    membershipType
  )

  await prisma.user.update({
    where: { id: params.userId },
    data: {
      membershipType,
      membershipExpiresAt: periodEnd,
      role: 'SUBSCRIBER',
      freeUploadsResetAt: periodEnd,
      appleOriginalTransactionId: params.originalTransactionId,
      appleProductId: params.productId,
      appleSubscriptionStatus: 'active',
      ...(creditUpdate as Record<string, unknown>),
    },
  })

  if (params.sendNotifications !== false) {
    const planName = membershipPlanDisplayName(params.planId)
    const blurb = PLAN_UPLOAD_BLURB[params.planId] || 'membership benefits'
    try {
      await prisma.notification.create({
        data: {
          userId: params.userId,
          type: 'system',
          title: 'Membership Activated! 🎉',
          message: `Welcome to ${planName}! You now have ${blurb}.`,
          link: '/pricing',
        },
      })
    } catch (err) {
      console.error('[apple-iap] notification failed', err)
    }
  }

  return { membershipType, membershipExpiresAt: periodEnd }
}
