import { prisma } from '@/lib/prisma'

/** Admin "Manage Account" toggle: when false, users cannot self-deactivate. Default true if unset. */
export async function isSelfServiceAccountDeactivationEnabled(): Promise<boolean> {
  try {
    const row = await prisma.mediaDetailSetting.findFirst()
    if (!row) return true
    const raw = (row as { shareAppsEnabled?: unknown }).shareAppsEnabled
    const auth =
      raw &&
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      (raw as Record<string, unknown>).__auth &&
      typeof (raw as Record<string, unknown>).__auth === 'object' &&
      !Array.isArray((raw as Record<string, unknown>).__auth)
        ? ((raw as Record<string, unknown>).__auth as Record<string, unknown>)
        : null
    return auth?.selfServiceDeactivateAccountEnabled !== false
  } catch {
    return true
  }
}
