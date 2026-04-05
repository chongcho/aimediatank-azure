/** Admin clamp for CropToolSetting.maxUploadSizeMb */
export const UPLOAD_MAX_SIZE_MB_MIN = 1
export const UPLOAD_MAX_SIZE_MB_MAX = 512
export const DEFAULT_MAX_UPLOAD_SIZE_MB = 10

export function clampUploadSizeMb(mb: number): number {
  const n = Math.round(Number(mb))
  if (!Number.isFinite(n)) return DEFAULT_MAX_UPLOAD_SIZE_MB
  return Math.min(UPLOAD_MAX_SIZE_MB_MAX, Math.max(UPLOAD_MAX_SIZE_MB_MIN, n))
}

/** Error copy when a file exceeds the configured max (pass resolved max bytes from server or client). */
export function buildUploadFileSizeExceededMessage(maxAllowedBytes: number): string {
  const mb = maxAllowedBytes / (1024 * 1024)
  const label = Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`
  return `File size exceeds the maximum allowed (${label}). You cannot upload this file.`
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
