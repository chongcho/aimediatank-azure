import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Sign in to send a share link by email' }, { status: 401 })
    }

    const { mediaId } = await params
    const body = await request.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    if (!email) {
      return NextResponse.json({ error: 'Email address is required' }, { status: 400 })
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
    }

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true, title: true, thumbnailUrl: true, type: true, url: true },
    })
    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    const senderName = session.user.name || session.user.username || 'Someone'
    const origin = (request.headers.get('origin') || new URL(request.url).origin).replace(/\/$/, '')
    const mediaUrl = origin + '/media/' + mediaId
    const title = media.title.replace(/<[^>]*>/g, '').trim()

    const toAbsolute = (url: string | null): string | null => {
      if (!url) return null
      if (url.startsWith('http://') || url.startsWith('https://')) return url
      return url.startsWith('/') ? origin + url : origin + '/' + url
    }
    const thumbUrl = toAbsolute(media.thumbnailUrl || (media.type === 'IMAGE' ? media.url : null))

    const escapeHtml = (s: string) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

    const imgBlock =
      thumbUrl &&
      '<p style="margin: 0 0 16px 0;"><a href="' +
        escapeHtml(mediaUrl) +
        '"><img src="' +
        escapeHtml(thumbUrl) +
        '" alt="' +
        escapeHtml(title) +
        '" style="width: 100%; max-width: 400px; height: auto; border-radius: 12px; display: block;" /></a></p>'

    const html =
      '<p style="font-size: 16px;">' +
      escapeHtml(senderName) +
      ' thought you might like this:</p>' +
      (imgBlock || '') +
      '<p style="font-size: 16px;"><strong>' +
      escapeHtml(title) +
      '</strong></p><p style="font-size: 16px;"><a href="' +
      escapeHtml(mediaUrl) +
      '" style="color: #0066cc;">' +
      escapeHtml(mediaUrl) +
      '</a></p><p style="font-size: 14px; color: #666;">This was sent from AI Media Tank.</p>'

    const subject = senderName + ' shared "' + (title.length > 50 ? title.slice(0, 50) + '…' : title) + '" with you'
    const sent = await sendEmail({
      to: email,
      subject,
      html,
    })

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send email. Please try again later.' }, { status: 500 })
    }

    await prisma.media.update({
      where: { id: mediaId },
      data: { shareCount: { increment: 1 } },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Share by email failed:', e)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
