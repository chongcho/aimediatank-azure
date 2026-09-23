import { isNativeIosApp, nativeFetch } from '@/lib/iosAppStoreCompliance'
import {
  membershipProductId,
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
  restore(): Promise<{
    transactions: Array<{ signedTransaction: string; transactionId: string; productId: string }>
  }>
}

const PLUGIN_TIMEOUT_MS = 120_000

async function getPlugin(): Promise<AppleIAPPlugin | null> {
  if (!isNativeIosApp()) return null
  try {
    const { registerPlugin } = await import('@capacitor/core')
    return registerPlugin<AppleIAPPlugin>('AppleIAP')
  } catch {
    return null
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${label} timed out after ${Math.round(ms / 1000)}s. If no Apple pay sheet appeared, rebuild the iOS app with the AppleIAP plugin and confirm IAP products are Ready to Submit in App Store Connect.`
        )
      )
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
  const plugin = await getPlugin()
  if (!plugin) {
    throw new Error('Apple IAP is only available in the iOS app')
  }
  const productId = membershipProductId(params.planId, params.billingPeriod)
  let purchase: { signedTransaction: string; transactionId: string; productId: string }
  try {
    purchase = await withTimeout(
      plugin.purchase({
        productId,
        appAccountToken: params.userId,
      }),
      PLUGIN_TIMEOUT_MS,
      'Apple membership purchase'
    )
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
  const plugin = await getPlugin()
  if (!plugin) {
    throw new Error('Apple IAP is only available in the iOS app')
  }
  const catalogRes = await withTimeout(
    nativeFetch(`/api/iap/products?mediaPrice=${encodeURIComponent(String(params.priceUsd))}`),
    20_000,
    'IAP product catalog'
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
    purchase = await withTimeout(
      plugin.purchase({
        productId,
        appAccountToken: params.userId,
      }),
      PLUGIN_TIMEOUT_MS,
      'Apple media unlock'
    )
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

export async function restoreAppleMemberships(): Promise<number> {
  const plugin = await getPlugin()
  if (!plugin) return 0
  const { transactions } = await withTimeout(plugin.restore(), PLUGIN_TIMEOUT_MS, 'Apple restore')
  let applied = 0
  for (const txn of transactions) {
    if (!txn.productId.includes('.membership.')) continue
    const res = await nativeFetch('/api/iap/membership/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedTransaction: txn.signedTransaction }),
    })
    if (res.ok) applied += 1
  }
  return applied
}
