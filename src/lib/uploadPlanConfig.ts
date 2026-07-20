/** Admin clamp for CropToolSetting.maxUploadSizeMb */
export const UPLOAD_MAX_SIZE_MB_MIN = 1
export const UPLOAD_MAX_SIZE_MB_MAX = 512
export const DEFAULT_MAX_UPLOAD_SIZE_MB = 10

export function clampUploadSizeMb(mb: number): number {
  const n = Math.round(Number(mb))
  if (!Number.isFinite(n)) return DEFAULT_MAX_UPLOAD_SIZE_MB
  return Math.min(UPLOAD_MAX_SIZE_MB_MAX, Math.max(UPLOAD_MAX_SIZE_MB_MIN, n))
}

/** Human-readable MB label for error copy (e.g. "50 MB", "62.3 MB"). */
export function formatUploadSizeMbLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`
}

/**
 * Error copy when a file exceeds the configured max.
 * When `actualFileSizeBytes` is set, message includes both sizes for clarity.
 */
export function buildUploadFileSizeExceededMessage(
  maxAllowedBytes: number,
  actualFileSizeBytes?: number | null
): string {
  const maxLabel = formatUploadSizeMbLabel(maxAllowedBytes)
  if (
    actualFileSizeBytes != null &&
    Number.isFinite(actualFileSizeBytes) &&
    actualFileSizeBytes > 0
  ) {
    const actualLabel = formatUploadSizeMbLabel(actualFileSizeBytes)
    return `This file is ${actualLabel}. The maximum allowed is ${maxLabel}. You cannot upload this file.`
  }
  return `File size exceeds the maximum allowed (${maxLabel}). You cannot upload this file.`
}

/** Upload limits and costs per plan — shared by upload complete API and deferred video notifications */
export const UPLOAD_CONFIG: Record<
  string,
  { freeUploads: number; costPerUpload: number; canUploadAfterFree: boolean }
> = {
  VIEWER: { freeUploads: 5, costPerUpload: 0, canUploadAfterFree: false },
  BASIC: { freeUploads: 5, costPerUpload: 1.0, canUploadAfterFree: true },
  ADVANCED: { freeUploads: 5, costPerUpload: 0.5, canUploadAfterFree: true },
  PREMIUM: { freeUploads: Infinity, costPerUpload: 0, canUploadAfterFree: true },
}

export function normalizeMembershipType(membershipType: string | null | undefined): string {
  const t = (membershipType || 'VIEWER').trim().toUpperCase()
  return UPLOAD_CONFIG[t] ? t : 'VIEWER'
}

/** Plan free-upload allowance (Infinity for Premium). */
export function getPlanFreeAllowance(membershipType: string | null | undefined): number {
  const type = normalizeMembershipType(membershipType)
  return UPLOAD_CONFIG[type].freeUploads
}

/** Unused plan free uploads for this period. */
export function getFreeUploadsRemaining(
  membershipType: string | null | undefined,
  freeUploadsUsed: number | null | undefined
): number {
  const type = normalizeMembershipType(membershipType)
  if (type === 'PREMIUM') return Infinity
  const allowance = getPlanFreeAllowance(type)
  return Math.max(0, allowance - (freeUploadsUsed || 0))
}

/** Admin / paid credit pool (not plan free uploads). */
export function getCreditPool(
  bonusCredits: number | null | undefined,
  paidUploadCredits: number | null | undefined
): number {
  return (bonusCredits || 0) + (paidUploadCredits || 0)
}

/**
 * Total uploads the user can still consume without paying again.
 * Admin Users "Credits" and Profile/Membership banner should use this.
 */
export function getUploadsAvailable(
  membershipType: string | null | undefined,
  freeUploadsUsed: number | null | undefined,
  bonusCredits: number | null | undefined,
  paidUploadCredits: number | null | undefined
): number | 'Unlimited' {
  const type = normalizeMembershipType(membershipType)
  if (type === 'PREMIUM') return 'Unlimited'
  return (
    getFreeUploadsRemaining(type, freeUploadsUsed) +
    getCreditPool(bonusCredits, paidUploadCredits)
  )
}

/**
 * On membership plan change: keep unused free uploads (add to bonusCredits),
 * then reset freeUploadsUsed so the new plan's free allowance is granted.
 * Same-plan events (renewal / duplicate Stripe webhooks) leave credits alone.
 */
export function buildMembershipPlanChangeCreditUpdate(
  previousMembershipType: string | null | undefined,
  freeUploadsUsed: number | null | undefined,
  nextMembershipType: string | null | undefined
): { freeUploadsUsed: number; bonusCredits?: { increment: number } } | Record<string, never> {
  const prev = normalizeMembershipType(previousMembershipType)
  const next = normalizeMembershipType(nextMembershipType)
  if (prev === next) return {}

  const remaining = getFreeUploadsRemaining(prev, freeUploadsUsed)
  const carry = Number.isFinite(remaining) ? remaining : 0
  const data: { freeUploadsUsed: number; bonusCredits?: { increment: number } } = {
    freeUploadsUsed: 0,
  }
  if (carry > 0) {
    data.bonusCredits = { increment: carry }
  }
  return data
}
