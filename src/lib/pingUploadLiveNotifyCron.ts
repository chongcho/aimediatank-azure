/**
 * Triggers GET /api/cron/upload-live-notify in a **new** HTTP request.
 * Deferred upload success email must not run only at the tail of a 25+ minute FFmpeg cron
 * request (often dropped on App Service). Pinging this short route right after the DB shows
 * a home-feed-ready URL matches when users see the card + when credits were already charged.
 */
export function pingUploadLiveNotifyCron(reason: 'preview' | 'complete'): void {
  const raw = (process.env.NEXTAUTH_URL || process.env.WEBAPP_URL || '').trim()
  const base = raw.replace(/\/$/, '')
  const secret = process.env.CRON_SECRET
  if (!base || !secret) {
    console.warn(
      `[UploadLiveNotifyPing] Skipped (${reason}): set NEXTAUTH_URL or WEBAPP_URL and CRON_SECRET on this App Service`
    )
    return
  }

  const url = `${base}/api/cron/upload-live-notify`
  void fetch(url, {
    method: 'GET',
    headers: { 'x-cron-secret': secret },
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.warn(`[UploadLiveNotifyPing] ${reason} → HTTP ${res.status} ${text.slice(0, 240)}`)
      } else {
        console.log(`[UploadLiveNotifyPing] ${reason} → ok`)
      }
    })
    .catch((e) => console.warn(`[UploadLiveNotifyPing] ${reason} fetch failed`, e))
}
