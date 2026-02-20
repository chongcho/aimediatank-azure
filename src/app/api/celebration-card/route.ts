import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, generateCelebrationCardEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const RATE_LIMIT_PER_HOUR = 10

function getBaseUrl(request: Request): string {
  const host = request.headers.get('host')
  if (!host) return process.env.NEXTAUTH_URL || 'https://www.aimediatank.com'
  return host.includes('localhost') ? `http://${host}` : `https://${host}`
}

// GET - List celebration cards sent by the current user (for Sent History)
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Sign in to view sent cards' }, { status: 401 })
    }

    const cards = await prisma.celebrationCard.findMany({
      where: { senderId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        media: {
          select: {
            id: true,
            title: true,
            type: true,
            thumbnailUrl: true,
          },
        },
      },
    })

    const baseUrl = getBaseUrl(request)
    return NextResponse.json(
      cards.map((c) => ({
        id: c.id,
        cardUrl: `${baseUrl}/card/${c.id}`,
        recipientEmail: c.recipientEmail,
        cardTitle: c.cardTitle,
        ttsMessage: c.ttsMessage,
        createdAt: c.createdAt,
        media: c.media
          ? {
              id: c.media.id,
              title: c.media.title,
              type: c.media.type,
              thumbnailUrl: c.media.thumbnailUrl,
            }
          : null,
      }))
    )
  } catch (e) {
    console.error('Celebration card list failed:', e)
    return NextResponse.json({ error: 'Failed to load sent cards' }, { status: 500 })
  }
}


// Simple in-memory rate limit by userId or IP (per deployment)
const recentCreates: { key: string; at: number }[] = []
function checkRateLimit(userId: string | null, ip: string): boolean {
  const key = userId || ip
  const now = Date.now()
  const window = 60 * 60 * 1000
  const recent = recentCreates.filter((r) => r.key === key && now - r.at < window)
  if (recent.length >= RATE_LIMIT_PER_HOUR) return false
  recentCreates.push({ key, at: now })
  if (recentCreates.length > 5000) recentCreates.splice(0, 2000)
  return true
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id ?? null
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'anonymous'

    if (!checkRateLimit(userId, ip)) {
      return NextResponse.json(
        { error: 'Too many celebration cards. Please try again later.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { mediaId, recipientEmail, cardTitle, ttsMessage } = body as {
      mediaId?: string
      recipientEmail?: string
      cardTitle?: string
      ttsMessage?: string
    }

    if (!mediaId || typeof mediaId !== 'string') {
      return NextResponse.json({ error: 'mediaId is required' }, { status: 400 })
    }

    const media = await prisma.media.findFirst({
      where: {
        id: mediaId,
        isDeleted: false,
        isApproved: true,
      },
      include: {
        user: { select: { username: true, name: true } },
      },
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    const card = await prisma.celebrationCard.create({
      data: {
        mediaId,
        senderId: userId ?? undefined,
        recipientEmail: typeof recipientEmail === 'string' && recipientEmail.trim() ? recipientEmail.trim() : undefined,
        cardTitle: typeof cardTitle === 'string' && cardTitle.trim() ? cardTitle.trim() : undefined,
        ttsMessage: typeof ttsMessage === 'string' && ttsMessage.trim() ? ttsMessage.trim() : undefined,
      },
    })

    const baseUrl = (process.env.NEXTAUTH_URL || '').replace(/\/$/, '') || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.aimediatank.com')
    const cardUrl = `${baseUrl}/card/${card.id}`

    const toAbsolute = (url: string | null): string | null => {
      if (!url) return null
      if (url.startsWith('http://') || url.startsWith('https://')) return url
      return url.startsWith('/') ? `${baseUrl}${url}` : `${baseUrl}/${url}`
    }

    const senderName = session?.user?.name || session?.user?.username || 'Someone'
    const senderEmail = session?.user?.email && typeof session.user.email === 'string' ? session.user.email : undefined

    let emailSent = false
    if (card.recipientEmail) {
      const thumbUrl = toAbsolute(media.thumbnailUrl || (media.type === 'IMAGE' ? media.url : null))
      const mediaTitle = media.title.replace(/#\w+/g, '').trim()
      const html = generateCelebrationCardEmail({
        senderEmail,
        cardUrl,
        mediaTitle,
        thumbnailUrl: thumbUrl,
      })
      const subject = card.ttsMessage && card.ttsMessage.trim()
        ? card.ttsMessage.trim().slice(0, 50) + (card.ttsMessage.trim().length > 50 ? '…' : '')
        : `You received a celebration card from ${senderName}`
      emailSent = await sendEmail({
        to: card.recipientEmail,
        subject,
        html,
        ...(senderEmail && { replyTo: senderEmail }),
      })
      if (!emailSent) {
        console.warn('Celebration card email failed to send to', card.recipientEmail)
      }
    }

    return NextResponse.json({
      cardId: card.id,
      cardUrl,
      emailSent,
    })
  } catch (e) {
    console.error('Celebration card create failed:', e)
    return NextResponse.json(
      { error: 'Failed to create celebration card' },
      { status: 500 }
    )
  }
}
