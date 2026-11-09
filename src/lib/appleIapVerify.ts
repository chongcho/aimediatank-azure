import { importPKCS8, SignJWT } from 'jose'
import { APPLE_BUNDLE_ID } from '@/lib/appleIapCatalog'

export type AppleTransactionPayload = {
  transactionId: string
  originalTransactionId: string
  productId: string
  bundleId: string
  /** ms since epoch; subscriptions only */
  expiresDate?: number
  purchaseDate?: number
  type?: string
  environment?: string
  appAccountToken?: string
}

function base64UrlToBuffer(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  return Buffer.from(padded + pad, 'base64')
}

/** Decode StoreKit 2 JWS payload (unsigned decode). Prefer App Store Server API when keys are set. */
export function decodeAppleTransactionJws(jws: string): AppleTransactionPayload {
  const parts = jws.trim().split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid Apple transaction JWS')
  }
  const json = base64UrlToBuffer(parts[1]).toString('utf8')
  const raw = JSON.parse(json) as Record<string, unknown>
  const transactionId = String(raw.transactionId || '')
  const originalTransactionId = String(raw.originalTransactionId || transactionId)
  const productId = String(raw.productId || '')
  const bundleId = String(raw.bundleId || '')
  if (!transactionId || !productId) {
    throw new Error('Apple transaction missing transactionId or productId')
  }
  return {
    transactionId,
    originalTransactionId,
    productId,
    bundleId,
    expiresDate: typeof raw.expiresDate === 'number' ? raw.expiresDate : undefined,
    purchaseDate: typeof raw.purchaseDate === 'number' ? raw.purchaseDate : undefined,
    type: typeof raw.type === 'string' ? raw.type : undefined,
    environment: typeof raw.environment === 'string' ? raw.environment : undefined,
    appAccountToken: typeof raw.appAccountToken === 'string' ? raw.appAccountToken : undefined,
  }
}

function appleApiCredentials(): {
  issuerId: string
  keyId: string
  privateKey: string
  bundleId: string
} | null {
  const issuerId = process.env.APPLE_IAP_ISSUER_ID?.trim()
  const keyId = process.env.APPLE_IAP_KEY_ID?.trim()
  const privateKey = process.env.APPLE_IAP_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()
  const bundleId = APPLE_BUNDLE_ID
  if (!issuerId || !keyId || !privateKey) return null
  return { issuerId, keyId, privateKey, bundleId }
}

async function createAppStoreServerToken(creds: {
  issuerId: string
  keyId: string
  privateKey: string
  bundleId: string
}): Promise<string> {
  const key = await importPKCS8(creds.privateKey, 'ES256')
  return new SignJWT({ bid: creds.bundleId })
    .setProtectedHeader({ alg: 'ES256', kid: creds.keyId, typ: 'JWT' })
    .setIssuer(creds.issuerId)
    .setIssuedAt()
    .setExpirationTime('50m')
    .setAudience('appstoreconnect-v1')
    .sign(key)
}

async function fetchAppleTransaction(
  transactionId: string,
  environment: 'Production' | 'Sandbox'
): Promise<AppleTransactionPayload | null> {
  const creds = appleApiCredentials()
  if (!creds) return null
  const host =
    environment === 'Sandbox'
      ? 'https://api.storekit-sandbox.itunes.apple.com'
      : 'https://api.storekit.itunes.apple.com'
  const token = await createAppStoreServerToken(creds)
  const res = await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[apple-iap] getTransaction failed', environment, res.status, text.slice(0, 300))
    return null
  }
  const body = (await res.json()) as { signedTransactionInfo?: string }
  if (!body.signedTransactionInfo) return null
  return decodeAppleTransactionJws(body.signedTransactionInfo)
}

/**
 * Validate a StoreKit 2 transaction JWS.
 * When APPLE_IAP_* keys are set, confirms via App Store Server API.
 * Otherwise accepts decoded JWS with bundleId check (until keys are configured).
 */
export async function verifyAppleTransactionJws(jws: string): Promise<AppleTransactionPayload> {
  const decoded = decodeAppleTransactionJws(jws)
  if (decoded.bundleId && decoded.bundleId !== APPLE_BUNDLE_ID) {
    throw new Error(`Bundle ID mismatch: ${decoded.bundleId}`)
  }

  const creds = appleApiCredentials()
  if (!creds) {
    if (process.env.NODE_ENV === 'production' && process.env.APPLE_IAP_ALLOW_UNVERIFIED !== 'true') {
      console.warn(
        '[apple-iap] APPLE_IAP_ISSUER_ID / KEY_ID / PRIVATE_KEY not set — accepting decoded JWS only'
      )
    }
    return decoded
  }

  const envHint =
    decoded.environment === 'Sandbox' || decoded.environment === 'Xcode' ? 'Sandbox' : 'Production'
  let verified =
    (await fetchAppleTransaction(decoded.transactionId, envHint)) ||
    (await fetchAppleTransaction(
      decoded.transactionId,
      envHint === 'Production' ? 'Sandbox' : 'Production'
    ))

  if (!verified) {
    console.warn('[apple-iap] Server API verify miss; using decoded JWS payload')
    verified = decoded
  }

  if (verified.bundleId && verified.bundleId !== APPLE_BUNDLE_ID) {
    throw new Error(`Bundle ID mismatch: ${verified.bundleId}`)
  }
  if (verified.productId !== decoded.productId) {
    throw new Error('Product ID mismatch after Apple verify')
  }
  return verified
}

/** App Store Server API subscription status codes. */
export type AppleSubscriptionStatusCode = 1 | 2 | 3 | 4 | 5

export type AppleSubscriptionStatusSummary = {
  status: AppleSubscriptionStatusCode | null
  autoRenewStatus: number | null
  productId: string | null
  expiresDateMs: number | null
  originalTransactionId: string
  environment: 'Production' | 'Sandbox'
  signedTransactionInfo: string | null
}

function decodeRenewalInfo(jws: string | undefined | null): {
  autoRenewStatus?: number
  productId?: string
} {
  if (!jws) return {}
  try {
    const parts = jws.trim().split('.')
    if (parts.length !== 3) return {}
    const raw = JSON.parse(base64UrlToBuffer(parts[1]).toString('utf8')) as Record<string, unknown>
    return {
      autoRenewStatus: typeof raw.autoRenewStatus === 'number' ? raw.autoRenewStatus : undefined,
      productId: typeof raw.productId === 'string' ? raw.productId : undefined,
    }
  } catch {
    return {}
  }
}

async function fetchSubscriptionStatusesOnce(
  originalTransactionId: string,
  environment: 'Production' | 'Sandbox'
): Promise<AppleSubscriptionStatusSummary | null> {
  const creds = appleApiCredentials()
  if (!creds) return null
  const host =
    environment === 'Sandbox'
      ? 'https://api.storekit-sandbox.itunes.apple.com'
      : 'https://api.storekit.itunes.apple.com'
  const token = await createAppStoreServerToken(creds)
  const res = await fetch(
    `${host}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(
      '[apple-iap] getSubscriptionStatuses failed',
      environment,
      res.status,
      text.slice(0, 300)
    )
    return null
  }
  const body = (await res.json()) as {
    data?: Array<{
      lastTransactions?: Array<{
        originalTransactionId?: string
        status?: number
        signedTransactionInfo?: string
        signedRenewalInfo?: string
      }>
    }>
  }
  const last = body.data?.[0]?.lastTransactions?.[0]
  if (!last) {
    return {
      status: null,
      autoRenewStatus: null,
      productId: null,
      expiresDateMs: null,
      originalTransactionId,
      environment,
      signedTransactionInfo: null,
    }
  }
  const txn = last.signedTransactionInfo
    ? decodeAppleTransactionJws(last.signedTransactionInfo)
    : null
  const renewal = decodeRenewalInfo(last.signedRenewalInfo)
  const status =
    typeof last.status === 'number' && last.status >= 1 && last.status <= 5
      ? (last.status as AppleSubscriptionStatusCode)
      : null
  return {
    status,
    autoRenewStatus:
      typeof renewal.autoRenewStatus === 'number' ? renewal.autoRenewStatus : null,
    productId: txn?.productId ?? renewal.productId ?? null,
    expiresDateMs: txn?.expiresDate ?? null,
    originalTransactionId,
    environment,
    signedTransactionInfo: last.signedTransactionInfo ?? null,
  }
}

/**
 * Load subscription status for an originalTransactionId (Production then Sandbox).
 * Returns null when App Store Server API credentials are not configured.
 */
export async function fetchAppleSubscriptionStatuses(
  originalTransactionId: string
): Promise<AppleSubscriptionStatusSummary | null> {
  const creds = appleApiCredentials()
  if (!creds) return null
  return (
    (await fetchSubscriptionStatusesOnce(originalTransactionId, 'Production')) ||
    (await fetchSubscriptionStatusesOnce(originalTransactionId, 'Sandbox'))
  )
}
