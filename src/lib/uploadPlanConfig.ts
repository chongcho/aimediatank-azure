/** Max size (bytes) for a single uploaded media file or thumbnail. Adjust after staging tests. */
export const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024

/** Human-readable limit for UI and API errors (keep in sync with MAX_UPLOAD_FILE_BYTES). */
export const MAX_UPLOAD_FILE_LABEL = '10 MB'

export const UPLOAD_FILE_SIZE_EXCEEDED_MESSAGE = `File size exceeds the maximum allowed (${MAX_UPLOAD_FILE_LABEL}). You cannot upload this file.`

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
