import { prisma } from '@/lib/prisma'

/** Public membership plan row used by Pricing, Stripe, and upload limits. */
export type MembershipPlanPublic = {
  planId: string
  name: string
  monthlyPrice: number
  yearlyPrice: number
  freeUploads: number
  pricePerUpload: number | null
  viewContents: boolean
  buyContents: boolean
  sellContents: boolean
  sortOrder: number
}

export const DEFAULT_MEMBERSHIP_PLANS: MembershipPlanPublic[] = [
  {
    planId: 'viewer',
    name: 'Viewer',
    monthlyPrice: 0,
    yearlyPrice: 0,
    freeUploads: 5,
    pricePerUpload: null,
    viewContents: true,
    buyContents: true,
    sellContents: true,
    sortOrder: 0,
  },
  {
    planId: 'basic',
    name: 'Basic',
    monthlyPrice: 2,
    yearlyPrice: 20,
    freeUploads: 10,
    pricePerUpload: null,
    viewContents: true,
    buyContents: true,
    sellContents: true,
    sortOrder: 1,
  },
  {
    planId: 'advanced',
    name: 'Advanced',
    monthlyPrice: 5,
    yearlyPrice: 50,
    freeUploads: 20,
    pricePerUpload: null,
    viewContents: true,
    buyContents: true,
    sellContents: true,
    sortOrder: 2,
  },
  {
    planId: 'premium',
    name: 'Premium',
    monthlyPrice: 8,
    yearlyPrice: 80,
    freeUploads: 30,
    pricePerUpload: null,
    viewContents: true,
    buyContents: true,
    sellContents: true,
    sortOrder: 3,
  },
]

/** Plain-text monthly upload limit copy (Upgrade Membership is linked in UI/email). */
export function buildMonthlyUploadLimitMessage(freeUploads: number): string {
  const n = Number.isFinite(freeUploads) ? Math.max(0, Math.floor(freeUploads)) : 0
  return `You've reached your monthly upload limit of ${n}. To continue posting content, please Upgrade Membership. All other platform features remain fully available for you to enjoy.`
}

/** HTML variant with Upgrade Membership linked to pricing. */
export function buildMonthlyUploadLimitHtml(
  freeUploads: number,
  upgradeUrl = 'https://aimediatank.com/pricing'
): string {
  const n = Number.isFinite(freeUploads) ? Math.max(0, Math.floor(freeUploads)) : 0
  return `You've reached your monthly upload limit of ${n}. To continue posting content, please <a href="${upgradeUrl}" style="color:#00ff88;font-weight:bold;text-decoration:underline;">Upgrade Membership</a>. All other platform features remain fully available for you to enjoy.`
}

export const PAID_PLAN_IDS = ['basic', 'advanced', 'premium'] as const
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number]

export function formatUsdAmount(n: number): string {
  return (Math.round(Number(n) * 100) / 100).toFixed(2)
}

export function formatUsd(n: number): string {
  return `$${formatUsdAmount(n)}`
}

export function dollarsToCents(dollars: number): number {
  return Math.round(Number(dollars) * 100)
}

function toPublic(plan: {
  planId: string
  name: string
  monthlyPrice: number
  yearlyPrice: number
  freeUploads: number
  pricePerUpload: number | null
  viewContents: boolean
  buyContents: boolean
  sellContents: boolean
  sortOrder: number
}): MembershipPlanPublic {
  return {
    planId: plan.planId,
    name: plan.name,
    monthlyPrice: plan.monthlyPrice,
    yearlyPrice: plan.yearlyPrice,
    freeUploads: plan.freeUploads,
    pricePerUpload: plan.pricePerUpload,
    viewContents: plan.viewContents,
    buyContents: plan.buyContents,
    sellContents: plan.sellContents,
    sortOrder: plan.sortOrder,
  }
}

/** Ensure default rows exist, then return active plans ordered for display. */
export async function ensureMembershipPlans(): Promise<MembershipPlanPublic[]> {
  let plans = await prisma.membershipPlan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })

  if (plans.length === 0) {
    for (const plan of DEFAULT_MEMBERSHIP_PLANS) {
      await prisma.membershipPlan.create({ data: plan })
    }
    plans = await prisma.membershipPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
  }

  return plans.map(toPublic)
}

export async function getMembershipPlanById(
  planId: string
): Promise<MembershipPlanPublic | null> {
  const id = planId.trim().toLowerCase()
  if (!id) return null

  const plans = await ensureMembershipPlans()
  return plans.find((p) => p.planId === id) ?? null
}

/** Stripe subscription checkout amounts (cents) from Admin MembershipPlan. */
export async function getStripeMembershipCheckoutPlan(planId: string): Promise<{
  name: string
  amount: number
  yearlyAmount: number
  uploadCost: number
} | null> {
  const id = planId.trim().toLowerCase()
  if (!PAID_PLAN_IDS.includes(id as PaidPlanId)) return null

  const plan = await getMembershipPlanById(id)
  if (!plan) return null

  return {
    name: plan.name.includes('Plan') ? plan.name : `${plan.name} Plan`,
    amount: dollarsToCents(plan.monthlyPrice),
    yearlyAmount: dollarsToCents(plan.yearlyPrice),
    // Pay-per-upload removed — membership upgrade only after free allowance.
    uploadCost: 0,
  }
}

/**
 * @deprecated Pay-per-upload removed. Always returns null; callers should prompt Upgrade Membership.
 */
export async function getStripeUploadCostCents(
  _membershipType?: string | null
): Promise<number | null> {
  return null
}

/**
 * Upload limits for a membership type, driven by MembershipPlan when present.
 * Premium always has unlimited free uploads. Over-limit uploads require upgrading — no pay-per-upload.
 */
export async function getUploadPlanConfig(membershipType: string | null | undefined): Promise<{
  freeUploads: number
  costPerUpload: number
  canUploadAfterFree: boolean
}> {
  const type = (membershipType || 'VIEWER').trim().toUpperCase()
  const fallbackByType: Record<
    string,
    { freeUploads: number; costPerUpload: number; canUploadAfterFree: boolean }
  > = {
    VIEWER: { freeUploads: 5, costPerUpload: 0, canUploadAfterFree: false },
    BASIC: { freeUploads: 10, costPerUpload: 0, canUploadAfterFree: false },
    ADVANCED: { freeUploads: 20, costPerUpload: 0, canUploadAfterFree: false },
    PREMIUM: { freeUploads: Infinity, costPerUpload: 0, canUploadAfterFree: true },
  }
  const fallback = fallbackByType[type] || fallbackByType.VIEWER
  const plan = await getMembershipPlanById(type.toLowerCase())
  if (!plan) return fallback

  if (type === 'PREMIUM') {
    return { freeUploads: Infinity, costPerUpload: 0, canUploadAfterFree: true }
  }

  return {
    freeUploads: Math.max(0, plan.freeUploads),
    costPerUpload: 0,
    canUploadAfterFree: false,
  }
}
