/**
 * Capacitor bridge for Apple Declared Age Range API (iOS 26+).
 * Used so social media features stay disabled for users under 13 per App Store age ratings.
 */

import { Capacitor, registerPlugin } from '@capacitor/core'

export type DeclaredAgeRangeResult = {
  available: boolean
  eligibleForAgeFeatures: boolean
  status: 'sharing' | 'declinedSharing' | 'unavailable' | 'error'
  lowerBound: number | null
  upperBound: number | null
  meetsSocialMinAge: boolean
  message?: string
}

type DeclaredAgeRangePlugin = {
  requestAgeRange(options?: { ageGates?: number[] }): Promise<DeclaredAgeRangeResult>
}

const NativeDeclaredAgeRange = registerPlugin<DeclaredAgeRangePlugin>('DeclaredAgeRange')

const STORAGE_KEY = 'amt.declaredAgeRange.v1'

export function readCachedDeclaredAgeRange(): DeclaredAgeRangeResult | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as DeclaredAgeRangeResult
  } catch {
    return null
  }
}

function cacheDeclaredAgeRange(result: DeclaredAgeRangeResult) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...result, cachedAt: Date.now() }))
  } catch {
    /* ignore */
  }
}

export async function requestDeclaredAgeRangeForSocial(options?: {
  force?: boolean
}): Promise<DeclaredAgeRangeResult> {
  const fallback: DeclaredAgeRangeResult = {
    available: false,
    eligibleForAgeFeatures: false,
    status: 'unavailable',
    lowerBound: null,
    upperBound: null,
    meetsSocialMinAge: true, // non-iOS / older OS: rely on account birthday gate
  }

  if (typeof window === 'undefined') return fallback
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return fallback
  }

  if (!options?.force) {
    const cached = readCachedDeclaredAgeRange()
    if (cached && cached.status !== 'error') {
      return cached
    }
  }

  try {
    const result = await NativeDeclaredAgeRange.requestAgeRange({ ageGates: [13, 16, 18] })
    cacheDeclaredAgeRange(result)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Declared Age Range unavailable'
    const failed: DeclaredAgeRangeResult = {
      ...fallback,
      status: 'error',
      // Fail closed for social until account birthday proves 13+.
      meetsSocialMinAge: false,
      message,
    }
    cacheDeclaredAgeRange(failed)
    return failed
  }
}

/**
 * Combine Apple Declared Age Range (when present) with account birthday social access.
 */
export function combineSocialAccess(accountAllowed: boolean, declared: DeclaredAgeRangeResult | null): boolean {
  if (!accountAllowed) return false
  if (!declared || !declared.available) return accountAllowed
  if (!declared.eligibleForAgeFeatures) return accountAllowed
  if (declared.status === 'declinedSharing') return false
  if (declared.status === 'error') return false
  return declared.meetsSocialMinAge
}
