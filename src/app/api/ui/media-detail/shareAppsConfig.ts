export const DEFAULT_SHARE_APPS: Record<string, boolean> = {
  email: true,
  whatsapp: true,
  kakao: true,
  facebook: true,
  x: true,
  linkedin: true,
  reddit: true,
  youtube: true,
  tiktok: true,
}

export function normalizeShareAppsEnabled(raw: unknown): Record<string, boolean> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out = { ...DEFAULT_SHARE_APPS }
    for (const key of Object.keys(DEFAULT_SHARE_APPS)) {
      const v = (raw as Record<string, unknown>)[key]
      if (typeof v === 'boolean') out[key] = v
    }
    return out
  }
  return { ...DEFAULT_SHARE_APPS }
}

