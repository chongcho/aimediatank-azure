import { DEFAULT_SHARE_APPS, normalizeShareAppsEnabled } from '@/app/api/ui/media-detail/shareAppsConfig'

export type MediaDetailUiSettings = {
  downloadEnabled: boolean
  shareEnabled: boolean
  sendByEmailEnabled: boolean
  aiToolEnabled: boolean
  shareAppsEnabled: Record<string, boolean>
}

const DEFAULT_SETTINGS: MediaDetailUiSettings = {
  downloadEnabled: true,
  shareEnabled: true,
  sendByEmailEnabled: true,
  aiToolEnabled: true,
  shareAppsEnabled: { ...DEFAULT_SHARE_APPS },
}

let settingsCache: MediaDetailUiSettings | null = null
let settingsPromise: Promise<MediaDetailUiSettings> | null = null

export function resetMediaDetailSettingsCache() {
  settingsCache = null
  settingsPromise = null
}

export function getMediaDetailSettingsSync(): MediaDetailUiSettings | null {
  return settingsCache
}

export async function fetchMediaDetailSettings(): Promise<MediaDetailUiSettings> {
  if (settingsCache) return settingsCache
  if (settingsPromise) return settingsPromise

  settingsPromise = (async () => {
    try {
      const res = await fetch('/api/ui/media-detail', { cache: 'no-store' })
      if (!res.ok) return DEFAULT_SETTINGS
      const data = await res.json()
      const payload: MediaDetailUiSettings = {
        downloadEnabled: data.downloadEnabled !== false,
        shareEnabled: data.shareEnabled !== false,
        sendByEmailEnabled: data.sendByEmailEnabled !== false,
        aiToolEnabled: data.aiToolEnabled !== false,
        shareAppsEnabled: normalizeShareAppsEnabled(data.shareAppsEnabled),
      }
      settingsCache = payload
      return payload
    } catch (error) {
      console.error('Error fetching media detail settings:', error)
      return DEFAULT_SETTINGS
    } finally {
      settingsPromise = null
    }
  })()

  return settingsPromise
}
