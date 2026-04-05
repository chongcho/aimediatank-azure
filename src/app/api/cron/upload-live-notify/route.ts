import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cronAuth'
import { backfillMissedUploadLiveNotification } from '@/lib/deferredUploadNotifications'

export const dynamic = 'force-dynamic'

/**
 * Short cron: deferred video upload emails + in-app (completed + uploadLiveNotifiedAt null).
 * Use a separate Azure timer from process-videos so this runs even while FFmpeg blocks the other route for many minutes.
 */
export async function GET(request: Request) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  const uploadNotifyBackfill = await backfillMissedUploadLiveNotification()
  return NextResponse.json({
    status: 'ok',
    message: 'Upload live notify backfill',
    uploadNotifyBackfill,
  })
}
