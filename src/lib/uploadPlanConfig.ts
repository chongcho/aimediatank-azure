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
