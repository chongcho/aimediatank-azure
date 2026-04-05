/**
 * Fire-and-forGET to /api/cron/* on this deployment so work runs in a fresh HTTP request
 * (reliable on App Service). Uses NEXTAUTH_URL || WEBAPP_URL + CRON_SECRET.
 */
function pingCronRoute(
  subpath: 'process-videos' | 'upload-live-notify',
  logLabel: string,
  reason: string
): void {
  const raw = (process.env.NEXTAUTH_URL || process.env.WEBAPP_URL || '').trim()
  const base = raw.replace(/\/$/, '')
  const secret = process.env.CRON_SECRET
  if (!base || !secret) {
    console.warn(
      `[${logLabel}] Skipped (${reason}): set NEXTAUTH_URL or WEBAPP_URL and CRON_SECRET on this App Service`
    )
    return
  }

  const url = `${base}/api/cron/${subpath}`
  void fetch(url, {
    method: 'GET',
    headers: { 'x-cron-secret': secret },
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.warn(`[${logLabel}] ${reason} → HTTP ${res.status} ${text.slice(0, 240)}`)
      } else {
        console.log(`[${logLabel}] ${reason} → ok`)
      }
    })
    .catch((e) => console.warn(`[${logLabel}] ${reason} fetch failed`, e))
}

/** After FFmpeg updates DB with a home-feed-ready URL (or completed). */
export function pingUploadLiveNotifyCron(reason: 'preview' | 'complete'): void {
  pingCronRoute('upload-live-notify', 'UploadLiveNotifyPing', reason)
}

/**
 * Kick video transcoding on **this** host. Use when Azure Functions WEBAPP_URL points at production
 * but uploads hit staging — otherwise VIDEO rows stay pending and never appear on the home feed.
 */
export function pingProcessVideosCron(reason: string): void {
  pingCronRoute('process-videos', 'ProcessVideosPing', reason)
}
