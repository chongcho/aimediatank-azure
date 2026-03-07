import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { inspectMediaForAgeRating } from '@/lib/contentInspection'
import { requireCronAuth } from '@/lib/cronAuth'

export const dynamic = 'force-dynamic'

/** Run inspection on one media and optionally notify admins if review needed */
async function runInspection(mediaId: string, notifyAdmins: boolean): Promise<{ reviewed: boolean }> {
  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { id: true, title: true, description: true },
  })
  if (!media) return { reviewed: false }
  const result = await inspectMediaForAgeRating({
    title: media.title,
    description: media.description ?? undefined,
  })
  if (result.status === 'review') {
    await prisma.media.update({
      where: { id: mediaId },
      data: {
        contentInspectionStatus: 'review',
        contentInspectionAlertAt: new Date(),
        contentInspectionSummary: result.summary ?? 'Content may need age rating review.',
      },
    })
    if (notifyAdmins) {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      })
      const safeTitle = (media.title || 'Untitled').slice(0, 80)
      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            type: 'system',
            title: '⚠️ Age rating review',
            message: `Media "${safeTitle}" may need age rating review. Check Admin → Media.`,
            link: '/admin?tab=media',
          },
        })
      }
    }
    return { reviewed: true }
  }
  await prisma.media.update({
    where: { id: mediaId },
    data: { contentInspectionStatus: 'pass' },
  })
  return { reviewed: false }
}

/**
 * POST: Run content inspection for age rating.
 * - Admin: body { mediaId?: string }. If mediaId, inspect that media; else inspect up to 50 pending.
 * - Cron: no body, inspect up to 50 pending (use Authorization: Bearer CRON_SECRET).
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  const isAdmin = session?.user && (session.user as { role?: string }).role === 'ADMIN'
  const cronError = requireCronAuth(request)
  const isCron = !cronError

  if (!isCron && !isAdmin) {
    return cronError ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    let body: { mediaId?: string } = {}
    try {
      body = await request.json()
    } catch {
      // No body for cron is fine
    }
    const mediaId = body?.mediaId

    if (mediaId) {
      const { reviewed } = await runInspection(mediaId, true)
      return NextResponse.json({ mediaId, reviewed })
    }

    const pending = await prisma.media.findMany({
      where: { contentInspectionStatus: 'pending', isDeleted: false },
      select: { id: true },
      take: 50,
      orderBy: { createdAt: 'desc' },
    })
    let reviewedCount = 0
    for (const m of pending) {
      const { reviewed } = await runInspection(m.id, true)
      if (reviewed) reviewedCount++
    }
    return NextResponse.json({ inspected: pending.length, reviewNeeded: reviewedCount })
  } catch (e) {
    console.error('Inspect-media error:', e)
    return NextResponse.json({ error: 'Inspection failed' }, { status: 500 })
  }
}
