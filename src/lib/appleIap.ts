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

async function getPlugin(): Promise<AppleIAPPlugin | null> {
  if (!isNativeIosApp()) return null
  try {
    const { registerPlugin } = await import('@capacitor/core')
    return registerPlugin<AppleIAPPlugin>('AppleIAP')
  } catch {
    return null
  }
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
  const purchase = await plugin.purchase({
    productId,
    appAccountToken: params.userId,
  })
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
  const catalogRes = await nativeFetch(
    `/api/iap/products?mediaPrice=${encodeURIComponent(String(params.priceUsd))}`
  )
  const catalog = await catalogRes.json()
  const productId =
    typeof catalog.mediaUnlockProductId === 'string' ? catalog.mediaUnlockProductId : null
  if (!productId) {
    throw new Error('This media price is not available for In-App Purchase')
  }
  const purchase = await plugin.purchase({
    productId,
    appAccountToken: params.userId,
  })
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
  const { transactions } = await plugin.restore()
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
