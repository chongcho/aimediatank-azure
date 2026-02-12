import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { processMedia } from '@/lib/mediaProcessor'

export const dynamic = 'force-dynamic'

// Maximum runtime for serverless: process one video per invocation
// Called by Azure Function timer trigger every ~1 minute
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization') || request.headers.get('x-cron-secret') || ''
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && authHeader !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find the oldest pending video (FIFO queue)
    const pendingMedia = await prisma.media.findFirst({
      where: {
        type: 'VIDEO',
        processingStatus: 'pending',
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, createdAt: true, cropData: true },
    })

    if (!pendingMedia) {
      return NextResponse.json({ status: 'idle', message: 'No pending videos' })
    }

    // Also check if something is already processing (avoid parallel processing)
    const currentlyProcessing = await prisma.media.findFirst({
      where: {
        type: 'VIDEO',
        processingStatus: 'processing',
      },
      select: { id: true, createdAt: true },
    })

    if (currentlyProcessing) {
      // Check if it's been stuck for more than 30 minutes — mark as failed so it can be retried
      const stuckThreshold = new Date(Date.now() - 30 * 60 * 1000)
      if (currentlyProcessing.createdAt < stuckThreshold) {
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

    // Parse optional crop data stored at upload time
    const cropData = pendingMedia.cropData as { x: number; y: number; width: number; height: number } | null

    // Process the video (this will update status to 'processing' → 'completed' or 'failed')
    await processMedia(pendingMedia.id, cropData || undefined)

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
