import { prisma } from '@/lib/prisma'
import { clampUploadSizeMb, DEFAULT_MAX_UPLOAD_SIZE_MB } from '@/lib/uploadPlanConfig'

/** Resolved byte limit from CropToolSetting (single source for SAS, complete, webhooks). */
export async function getMaxUploadFileBytes(): Promise<number> {
  try {
    const row = await prisma.cropToolSetting.findFirst()
    const rawMb =
      row?.maxUploadSizeMb != null ? Number(row.maxUploadSizeMb) : DEFAULT_MAX_UPLOAD_SIZE_MB
    return clampUploadSizeMb(rawMb) * 1024 * 1024
  } catch {
    return DEFAULT_MAX_UPLOAD_SIZE_MB * 1024 * 1024
  }
}
