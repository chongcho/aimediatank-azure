/** App Store product IDs — create matching products in App Store Connect before review. */

export const APPLE_BUNDLE_ID =
  process.env.APPLE_BUNDLE_ID?.trim() || 'com.aimediatank.apple'

export type AppleBillingPeriod = 'month' | 'year'
export type AppleMembershipPlanId = 'basic' | 'advanced' | 'premium'

export type MembershipProduct = {
  productId: string
  planId: AppleMembershipPlanId
  billingPeriod: AppleBillingPeriod
  /** Display USD for docs / review notes (actual price set in App Store Connect). */
  listPriceUsd: number
}

/** ASC Product IDs are permanent — deleted IDs cannot be reused, so live IDs use `.v2`. */
const MEMBERSHIP_PRODUCTS: MembershipProduct[] = [
  { productId: 'com.aimediatank.apple.membership.basic.month.v2', planId: 'basic', billingPeriod: 'month', listPriceUsd: 1.99 },
  { productId: 'com.aimediatank.apple.membership.basic.year.v2', planId: 'basic', billingPeriod: 'year', listPriceUsd: 19.99 },
  { productId: 'com.aimediatank.apple.membership.advanced.month.v2', planId: 'advanced', billingPeriod: 'month', listPriceUsd: 4.99 },
  { productId: 'com.aimediatank.apple.membership.advanced.year.v2', planId: 'advanced', billingPeriod: 'year', listPriceUsd: 49.99 },
  { productId: 'com.aimediatank.apple.membership.premium.month.v2', planId: 'premium', billingPeriod: 'month', listPriceUsd: 7.99 },
  { productId: 'com.aimediatank.apple.membership.premium.year.v2', planId: 'premium', billingPeriod: 'year', listPriceUsd: 79.99 },
]

/** Consumable unlock tiers — charge the smallest tier that covers the media list price. */
export type MediaUnlockTier = {
  productId: string
  /** Tier ceiling in USD (product price in ASC should match). */
  usd: number
}

export const MEDIA_UNLOCK_TIERS: MediaUnlockTier[] = [
  { productId: 'com.aimediatank.apple.media.unlock.099', usd: 0.99 },
  { productId: 'com.aimediatank.apple.media.unlock.199', usd: 1.99 },
  { productId: 'com.aimediatank.apple.media.unlock.299', usd: 2.99 },
  { productId: 'com.aimediatank.apple.media.unlock.399', usd: 3.99 },
  { productId: 'com.aimediatank.apple.media.unlock.499', usd: 4.99 },
  { productId: 'com.aimediatank.apple.media.unlock.599', usd: 5.99 },
  { productId: 'com.aimediatank.apple.media.unlock.699', usd: 6.99 },
  { productId: 'com.aimediatank.apple.media.unlock.799', usd: 7.99 },
  { productId: 'com.aimediatank.apple.media.unlock.899', usd: 8.99 },
  { productId: 'com.aimediatank.apple.media.unlock.999', usd: 9.99 },
]

const membershipByProductId = new Map(MEMBERSHIP_PRODUCTS.map((p) => [p.productId, p]))
const mediaTierByProductId = new Map(MEDIA_UNLOCK_TIERS.map((t) => [t.productId, t]))

export function allAppleIapProductIds(): string[] {
  return [...MEMBERSHIP_PRODUCTS.map((p) => p.productId), ...MEDIA_UNLOCK_TIERS.map((t) => t.productId)]
}

export function membershipProductId(
  planId: AppleMembershipPlanId,
  billingPeriod: AppleBillingPeriod
): string {
  return `com.aimediatank.apple.membership.${planId}.${billingPeriod}.v2`
}

export function parseMembershipProductId(productId: string): MembershipProduct | null {
  return membershipByProductId.get(productId) ?? null
}

export function mediaUnlockProductForPrice(priceUsd: number): MediaUnlockTier | null {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null
  const tier = MEDIA_UNLOCK_TIERS.find((t) => t.usd + 1e-9 >= priceUsd)
  return tier ?? null
}

export function parseMediaUnlockProductId(productId: string): MediaUnlockTier | null {
  return mediaTierByProductId.get(productId) ?? null
}

export function membershipPlanDisplayName(planId: string): string {
  const id = planId.toLowerCase()
  if (id === 'basic') return 'Basic Plan'
  if (id === 'advanced') return 'Advanced Plan'
  if (id === 'premium') return 'Premium Plan'
  return 'Membership'
}
