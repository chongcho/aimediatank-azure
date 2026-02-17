import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  try {
    const { cardId } = await params

    const card = await prisma.celebrationCard.findUnique({
      where: { id: cardId },
      include: {
        media: {
          select: {
            id: true,
            title: true,
            type: true,
            thumbnailUrl: true,
            url: true,
            processingStatus: true,
            isDeleted: true,
            user: {
              select: { username: true, name: true },
            },
          },
        },
        sender: {
          select: { username: true, name: true },
        },
      },
    })

    if (!card || !card.media || card.media.isDeleted) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    if (card.expiresAt && new Date() > card.expiresAt) {
      return NextResponse.json({ error: 'This card has expired' }, { status: 410 })
    }

    return NextResponse.json({
      id: card.id,
      cardTitle: card.cardTitle,
      ttsMessage: card.ttsMessage,
      senderName: card.sender?.name || card.sender?.username || null,
      media: {
        id: card.media.id,
        title: card.media.title,
        type: card.media.type,
        thumbnailUrl: card.media.thumbnailUrl,
        url: card.media.url,
        processingStatus: card.media.processingStatus,
        creatorUsername: card.media.user.username,
        creatorName: card.media.user.name,
      },
    })
  } catch (e) {
    console.error('Celebration card get failed:', e)
    return NextResponse.json(
      { error: 'Failed to load card' },
      { status: 500 }
    )
  }
}
