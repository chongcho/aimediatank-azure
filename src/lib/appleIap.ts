import { registerPlugin } from '@capacitor/core'
import { IOS_IAP_UNAVAILABLE_MESSAGE, isNativeIosApp, nativeFetch } from '@/lib/iosAppStoreCompliance'
import {
  membershipPlanRank,
  membershipProductId,
  parseMembershipProductId,
  type AppleBillingPeriod,
  type AppleMembershipPlanId,
} from '@/lib/appleIapCatalog'

type AppleIAPPlugin = {
  getProducts(options: { productIds: string[] }): Promise<{
    products: Array<{
      id: string
      displayName: string
      description: string
      displayPrice: string
      price: number
    }>
  }>
  purchase(options: {
    productId: string
    appAccountToken?: string
  }): Promise<{ signedTransaction: string; transactionId: string; productId: string }>
  restore(options?: { skipSync?: boolean }): Promise<{
    transactions: Array<{ signedTransaction: string; transactionId: string; productId: string }>
  }>
  manageSubscriptions(): Promise<{ ok?: boolean }>
}

const PLUGIN_TIMEOUT_MS = 120_000

function getPlugin(): AppleIAPPlugin | null {
  if (!isNativeIosApp()) return null
  return registerPlugin<AppleIAPPlugin>('AppleIAP')
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(IOS_IAP_UNAVAILABLE_MESSAGE))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

function rethrowPluginError(error: unknown, fallback: string): never {
  const e = error as { message?: string; code?: string; errorMessage?: string } | null
  const msg =
    (e && typeof e === 'object' && (e.message || e.errorMessage)) ||
    (error instanceof Error ? error.message : null) ||
    fallback
  const code = e && typeof e === 'object' ? e.code : undefined
  const next = new Error(String(msg)) as Error & { code?: string }
  if (code === 'USER_CANCELLED' || /cancel/i.test(String(msg))) {
    next.code = 'USER_CANCELLED'
    next.message = 'Purchase cancelled'
  } else if (code) {
    next.code = code
  }
  throw next
}

export async function purchaseAppleMembership(params: {
  planId: AppleMembershipPlanId
  billingPeriod: AppleBillingPeriod
  userId: string
}): Promise<{ membershipType: string; membershipExpiresAt?: string }> {
  const plugin = getPlugin()
  if (!plugin) {
    throw new Error('Apple IAP is only available in the iOS app')
  }
  const productId = membershipProductId(params.planId, params.billingPeriod)
  let purchase: { signedTransaction: string; transactionId: string; productId: string }
  try {
    purchase = await plugin.purchase({
      productId,
      appAccountToken: params.userId,
    })
  } catch (error) {
    rethrowPluginError(error, 'Membership purchase failed')
  }
  const res = await nativeFetch('/api/iap/membership/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedTransaction: purchase.signedTransaction }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Membership verify failed')
  }
  return {
    membershipType: data.membershipType,
    membershipExpiresAt: data.membershipExpiresAt,
  }
}

export async function purchaseAppleMediaUnlock(params: {
  mediaId: string
  priceUsd: number
  userId: string
}): Promise<void> {
  const plugin = getPlugin()
  if (!plugin) {
    throw new Error('Apple IAP is only available in the iOS app')
  }
  const catalogRes = await withTimeout(
    nativeFetch(`/api/iap/products?mediaPrice=${encodeURIComponent(String(params.priceUsd))}`),
    20_000
  )
  const catalog = await catalogRes.json()
  if (!catalogRes.ok) {
    throw new Error(
      typeof catalog.error === 'string' ? catalog.error : 'Could not load In-App Purchase products'
    )
  }
  const productId =
    typeof catalog.mediaUnlockProductId === 'string' ? catalog.mediaUnlockProductId : null
  if (!productId) {
    throw new Error(
      'This media price is not available for In-App Purchase (max $9.99 via Apple unlock tiers).'
    )
  }
  let purchase: { signedTransaction: string; transactionId: string; productId: string }
  try {
    purchase = await plugin.purchase({
      productId,
      appAccountToken: params.userId,
    })
  } catch (error) {
    rethrowPluginError(error, 'Media unlock purchase failed')
  }
  const res = await nativeFetch('/api/iap/media/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signedTransaction: purchase.signedTransaction,
      mediaId: params.mediaId,
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Media unlock verify failed')
  }
}

export async function restoreAppleMemberships(options?: {
  /** Skip AppStore.sync() — prefer after manageSubscriptions to avoid extra Apple ID prompts. */
  skipSync?: boolean
}): Promise<number> {
  const plugin = getPlugin()
  if (!plugin) return 0
  const { transactions } = await withTimeout(
    plugin.restore(options?.skipSync ? { skipSync: true } : undefined),
    PLUGIN_TIMEOUT_MS
  )
  // Prefer the highest plan. Verifying Basic after Advanced would flip Current Plan back down.
  let best: { signedTransaction: string; rank: number } | null = null
  for (const txn of transactions) {
    if (!txn.productId.includes('.membership.')) continue
    const parsed = parseMembershipProductId(txn.productId)
    if (!parsed) continue
    const rank = membershipPlanRank(parsed.planId)
    if (!best || rank > best.rank) {
      best = { signedTransaction: txn.signedTransaction, rank }
    }
  }
  if (!best) return 0
  const res = await nativeFetch('/api/iap/membership/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedTransaction: best.signedTransaction }),
  })
  return res.ok ? 1 : 0
}

export type AppleMembershipSyncResult = {
  membershipType: string
  membershipExpiresAt?: string | null
  appleSubscriptionStatus?: string | null
}

/** Sync server membership after restore/manage — downgrades when Apple entitlements are gone. */
export async function syncAppleMembership(params?: {
  noActiveEntitlements?: boolean
}): Promise<AppleMembershipSyncResult | null> {
  const res = await nativeFetch('/api/iap/membership/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      noActiveEntitlements: params?.noActiveEntitlements === true,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Membership sync failed')
  }
  return {
    membershipType: String(data.membershipType || 'VIEWER'),
    membershipExpiresAt: data.membershipExpiresAt ?? null,
    appleSubscriptionStatus: data.appleSubscriptionStatus ?? null,
  }
}

/**
 * After Apple subscription management: restore without forcing AppStore.sync, then sync server.
 */
export async function refreshAppleMembershipAfterManage(): Promise<AppleMembershipSyncResult | null> {
  const restored = await restoreAppleMemberships({ skipSync: true })
  return syncAppleMembership({ noActiveEntitlements: restored === 0 })
}

/** Opens Apple's in-app sheet to cancel or change the App Store subscription. */
export async function manageAppleSubscriptions(): Promise<void> {
  const plugin = getPlugin()
  if (!plugin) {
    throw new Error('Apple subscription management is only available in the iOS app')
  }
  try {
    await plugin.manageSubscriptions()
  } catch (error) {
    rethrowPluginError(error, 'Could not open Apple subscription management')
  }
}
