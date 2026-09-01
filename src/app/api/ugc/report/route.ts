import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isUserBlocked } from '@/lib/userBlocks'

export const dynamic = 'force-dynamic'

const REPORT_REASONS = new Set([
  'spam',
  'harassment',
  'hate',
  'nudity',
  'violence',
  'copyright',
  'other',
])

type ReportBody = {
  reportType?: unknown
  reason?: unknown
  details?: unknown
  mediaId?: unknown
  reportedUserId?: unknown
  chatMessageId?: unknown
}

function normalizeReason(reason: string, details?: string) {
  const base = reason.trim().toLowerCase()
  const extra = details?.trim()
  return extra ? `${base}: ${extra}` : base
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please log in to report content' }, { status: 401 })
    }

    const body = (await request.json()) as ReportBody
    const reportType =
      typeof body.reportType === 'string' ? body.reportType.trim().toUpperCase() : 'MEDIA'
    const reasonRaw = typeof body.reason === 'string' ? body.reason.trim().toLowerCase() : ''
    const details = typeof body.details === 'string' ? body.details.trim() : undefined

    if (!REPORT_REASONS.has(reasonRaw)) {
      return NextResponse.json({ error: 'Please choose a report reason' }, { status: 400 })
    }

    const reason = normalizeReason(reasonRaw, details)

    if (reportType === 'MEDIA') {
      const mediaId = typeof body.mediaId === 'string' ? body.mediaId.trim() : ''
      if (!mediaId) {
        return NextResponse.json({ error: 'Media ID is required' }, { status: 400 })
      }
      const media = await prisma.media.findUnique({
        where: { id: mediaId },
        select: { id: true, userId: true, isDeleted: true },
      })
      if (!media || media.isDeleted) {
        return NextResponse.json({ error: 'Content not found' }, { status: 404 })
      }
      if (media.userId === session.user.id) {
        return NextResponse.json({ error: 'You cannot report your own content' }, { status: 400 })
      }

      await prisma.report.create({
        data: {
          userId: session.user.id,
          reportType: 'MEDIA',
          mediaId: media.id,
          reportedUserId: media.userId,
          reason,
        },
      })
      return NextResponse.json({ success: true })
    }

    if (reportType === 'USER') {
      const reportedUserId =
        typeof body.reportedUserId === 'string' ? body.reportedUserId.trim() : ''
      if (!reportedUserId) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
      }
      if (reportedUserId === session.user.id) {
        return NextResponse.json({ error: 'You cannot report yourself' }, { status: 400 })
      }
      const reported = await prisma.user.findUnique({
        where: { id: reportedUserId },
        select: { id: true },
      })
      if (!reported) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      await prisma.report.create({
        data: {
          userId: session.user.id,
          reportType: 'USER',
          reportedUserId,
          reason,
        },
      })
      return NextResponse.json({ success: true })
    }

    if (reportType === 'CHAT_MESSAGE') {
      const chatMessageId =
        typeof body.chatMessageId === 'string' ? body.chatMessageId.trim() : ''
      if (!chatMessageId) {
        return NextResponse.json({ error: 'Message ID is required' }, { status: 400 })
      }
      const message = await prisma.chatMessage.findUnique({
        where: { id: chatMessageId },
        select: { id: true, userId: true },
      })
      if (!message) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 })
      }
      if (message.userId === session.user.id) {
        return NextResponse.json({ error: 'You cannot report your own message' }, { status: 400 })
      }

      await prisma.report.create({
        data: {
          userId: session.user.id,
          reportType: 'CHAT_MESSAGE',
          chatMessageId: message.id,
          reportedUserId: message.userId,
          reason,
        },
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
  } catch (error) {
    console.error('Report create error:', error)
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ blockedUserIds: [] })
    }

    const rows = await prisma.userBlock.findMany({
      where: { blockerId: session.user.id },
      select: { blockedId: true },
    })
    return NextResponse.json({ blockedUserIds: rows.map((row) => row.blockedId) })
  } catch (error) {
    console.error('Blocked users fetch error:', error)
    return NextResponse.json({ blockedUserIds: [] })
  }
}

/** Block a user, notify admins via Report, and hide their content immediately for the blocker. */
export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    }

    const body = (await request.json()) as { blockedUserId?: unknown; reason?: unknown }
    const blockedUserId =
      typeof body.blockedUserId === 'string' ? body.blockedUserId.trim() : ''
    const reason =
      typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim()
        : 'Blocked by user'

    if (!blockedUserId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }
    if (blockedUserId === session.user.id) {
      return NextResponse.json({ error: 'You cannot block yourself' }, { status: 400 })
    }

    const blocked = await prisma.user.findUnique({
      where: { id: blockedUserId },
      select: { id: true, username: true },
    })
    if (!blocked) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const alreadyBlocked = await isUserBlocked(session.user.id, blockedUserId)
    if (!alreadyBlocked) {
      await prisma.userBlock.create({
        data: {
          blockerId: session.user.id,
          blockedId: blockedUserId,
          reason,
        },
      })
      await prisma.report.create({
        data: {
          userId: session.user.id,
          reportType: 'USER',
          reportedUserId: blockedUserId,
          reason: `user_block: ${reason}`,
        },
      })
    }

    return NextResponse.json({ success: true, blockedUserId })
  } catch (error) {
    console.error('Block user error:', error)
    return NextResponse.json({ error: 'Failed to block user' }, { status: 500 })
  }
}
