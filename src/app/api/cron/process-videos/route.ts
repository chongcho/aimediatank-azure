import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { processMedia } from '@/lib/mediaProcessor'
import { requireCronAuth } from '@/lib/cronAuth'

export const dynamic = 'force-dynamic'

// Maximum runtime for serverless: process one video per invocation
// Called by Azure Function timer trigger every ~1 minute
export async function GET(request: Request) {
  try {
    const authError = requireCronAuth(request)
    if (authError) return authError

    // Find the oldest pending video (FIFO queue)
    const pendingMedia = await prisma.media.findFirst({
      where: {
        type: 'VIDEO',
        processingStatus: 'pending',
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, createdAt: true, cropData: true, trimStart: true, trimEnd: true },
    })

    if (!pendingMedia) {
      return NextResponse.json({ status: 'idle', message: 'No pending videos' })
    }

    // If this pending item has been waiting too long, cron likely wasn't running — mark failed so UI shows error
    const pendingStaleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours
    if (pendingMedia.createdAt < pendingStaleThreshold) {
      await prisma.media.update({
        where: { id: pendingMedia.id },
        data: {
          processingStatus: 'failed',
          processingError: 'Processing did not start in time. Ensure the process-videos Azure Function is deployed and WEBAPP_URL + CRON_SECRET are set.',
        },
      })
      console.log(`[ProcessVideos] Marked long-pending media ${pendingMedia.id} as failed (created ${pendingMedia.createdAt.toISOString()})`)
      return NextResponse.json({
        status: 'stale_pending_failed',
        mediaId: pendingMedia.id,
        message: 'Marked stale pending as failed',
      })
    }

    // Also check if something is already processing (avoid parallel processing)
    const currentlyProcessing = await prisma.media.findFirst({
      where: {
        type: 'VIDEO',
        processingStatus: 'processing',
      },
      select: { id: true, updatedAt: true },
    })

    if (currentlyProcessing) {
      // Stuck = still "processing" after 30 min (use updatedAt: when we set status to 'processing' we touch the row)
      const stuckThreshold = new Date(Date.now() - 30 * 60 * 1000)
      if (currentlyProcessing.updatedAt < stuckThreshold) {
        await prisma.media.update({
          where: { id: currentlyProcessing.id },
          data: {
            processingStatus: 'failed',
            processingError: 'Processing timed out after 30 minutes',
          },
        })
        console.log(`[ProcessVideos] Marked stuck media ${currentlyProcessing.id} as failed`)
      } else {
        return NextResponse.json({
          status: 'busy',
          message: `Already processing media ${currentlyProcessing.id}`,
        })
      }
    }

    console.log(`[ProcessVideos] Starting processing for "${pendingMedia.title}" (${pendingMedia.id})`)

    // Parse optional crop and trim stored at upload time
    const cropData = pendingMedia.cropData as { x: number; y: number; width: number; height: number } | null
    const trimStart = pendingMedia.trimStart != null ? Number(pendingMedia.trimStart) : undefined
    const trimEnd = pendingMedia.trimEnd != null ? Number(pendingMedia.trimEnd) : undefined
    const trimData = trimStart != null && trimEnd != null && trimEnd > trimStart
      ? { start: trimStart, end: trimEnd }
      : undefined

    // Process the video (this will update status to 'processing' → 'completed' or 'failed')
    await processMedia(pendingMedia.id, cropData || undefined, trimData)

    return NextResponse.json({
      status: 'processed',
      mediaId: pendingMedia.id,
      title: pendingMedia.title,
    })
  } catch (error) {
    console.error('[ProcessVideos] Cron error:', error)
    return NextResponse.json(
      { error: 'Processing failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
