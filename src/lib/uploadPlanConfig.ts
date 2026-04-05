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
