import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, generateShareMediaEmail } from '@/lib/email'

function getBaseUrl(request: Request): string {
  const host = request.headers.get('host')
  if (!host) return 'https://aimediatank.com'
  return host.includes('localhost') ? `http://${host}` : `https://${host}`
}

function toAbsoluteUrl(baseUrl: string, url: string | null): string | null {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('/')) return `${baseUrl}${url}`
  return `${baseUrl}/${url}`
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params
    const body = await request.json()
    const to = typeof body.to === 'string' ? body.to.trim() : ''
    const message = typeof body.message === 'string' ? body.message.trim() : undefined
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: 'Valid email address required' }, { status: 400 })
    }

    const session = await getServerSession(authOptions)

    let senderName = session?.user?.name || session?.user?.username || 'Someone'
    let senderEmail: string | undefined = session?.user?.email || undefined
    if (session?.user?.id) {
      const sender = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { legalName: true, name: true, username: true, email: true },
      })
      senderName = sender?.legalName || sender?.name || session?.user?.username || senderName
      senderEmail = sender?.email || session?.user?.email || undefined
    }

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true, title: true, thumbnailUrl: true, isDeleted: true },
    })
    if (!media || media.isDeleted) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    const baseUrl = getBaseUrl(request)
    const mediaPageUrl = `${baseUrl}/media/${media.id}`
    const thumbnailUrl = toAbsoluteUrl(baseUrl, media.thumbnailUrl)

    const title = media.title.replace(/#\w+/g, '').trim() || 'Media'
    const subject = `${senderName} shared this with you`
    const { html } = generateShareMediaEmail({
      senderName,
      senderEmail,
      mediaTitle: title,
      mediaPageUrl,
      thumbnailUrl,
      message,
    })

    const shareSender = process.env.AZURE_EMAIL_SHARE_SENDER || 'aimediatank@aimediatank.com'
    const sent = await sendEmail({
      to,
      subject,
      html,
      senderAddress: shareSender,
      fromName: senderName,
    })
    if (!sent) {
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    await prisma.media.update({
      where: { id: mediaId },
      data: { shareCount: { increment: 1 } },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Share email error:', e)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
