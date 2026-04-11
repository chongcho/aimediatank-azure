import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { inspectMediaForAgeRating } from '@/lib/contentInspection'

export const dynamic = 'force-dynamic'

// One-time fix: Mark messages with conversationId as private (they were incorrectly stored as public)
let dataFixApplied = false
async function fixPrivateMessages() {
  if (dataFixApplied) return
  dataFixApplied = true
  
  try {
    // Fix messages that have conversationId but isPrivate=false
    const result = await prisma.chatMessage.updateMany({
      where: {
        conversationId: { not: null },
        isPrivate: false,
      },
      data: {
        isPrivate: true,
      },
    })
    if (result.count > 0) {
      console.log(`Fixed ${result.count} private messages that were incorrectly marked as public`)
    }
  } catch (error) {
    console.error('Error fixing private messages:', error)
  }
}

// GET - Fetch recent chat messages
export async function GET(request: Request) {
  try {
    // Apply one-time data fix
    await fixPrivateMessages()
    
    const session = await getServerSession(authOptions)
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const after = searchParams.get('after') // Get messages after this timestamp
    const mode = searchParams.get('mode') || 'open' // 'open' or 'private'
    const recipientId = searchParams.get('recipientId') // For private chat

    let where: any = {}
    
    if (after) {
      where.createdAt = {
        gt: new Date(after),
      }
    }

    if (mode === 'private') {
      // Private chat: only messages between current user and recipient
      if (!session?.user?.id || !recipientId) {
        return NextResponse.json({ messages: [] })
      }
      
      // Use AND to properly combine isPrivate with OR conditions
      where.AND = [
        { isPrivate: true },
        {
          OR: [
            { userId: session.user.id, recipientId: recipientId },
            { userId: recipientId, recipientId: session.user.id },
          ]
        }
      ]
    } else {
      // Open chat: only public messages (isPrivate = false)
      where.isPrivate = false
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
            role: true,
            warningCount: true,
          },
        },
      },
    })

    // Reverse to get chronological order
    return NextResponse.json({
      messages: messages.reverse(),
    })
  } catch (error: unknown) {
    console.error('Error fetching chat messages:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to fetch messages', details: errorMessage },
      { status: 500 }
    )
  }
}

// POST - Send a new chat message (Subscribers only)
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only subscribers and admins can send messages
    if (session.user.role !== 'SUBSCRIBER' && session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only subscribers can send chat messages' },
        { status: 403 }
      )
    }

    const { content, isPrivate, recipientId } = await request.json()

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      )
    }

    // Limit message length
    if (content.length > 500) {
      return NextResponse.json(
        { error: 'Message too long (max 500 characters)' },
        { status: 400 }
      )
    }

    // Validate private message has recipient
    if (isPrivate && !recipientId) {
      return NextResponse.json(
        { error: 'Recipient is required for private messages' },
        { status: 400 }
      )
    }

    const message = await prisma.chatMessage.create({
      data: {
        content: content.trim(),
        userId: session.user.id,
        isPrivate: isPrivate || false,
        recipientId: isPrivate ? recipientId : null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
            role: true,
            warningCount: true,
          },
        },
      },
    })

    // Open Chat only: run content inspection for age rating in background; flag and notify admins if review needed
    if (!message.isPrivate) {
      const runInspection = async () => {
        try {
          const inspection = await inspectMediaForAgeRating({ title: message.content, description: undefined })
          if (inspection.status === 'review') {
            await prisma.chatMessage.update({
              where: { id: message.id },
              data: {
                contentInspectionStatus: 'review',
                contentInspectionAlertAt: new Date(),
                contentInspectionSummary: inspection.summary ?? 'Message may need age rating review.',
              },
            })
            const admins = await prisma.user.findMany({
              where: { role: 'ADMIN' },
              select: { id: true },
            })
            const preview = (message.content || '').slice(0, 50)
            for (const admin of admins) {
              await prisma.notification.create({
                data: {
                  userId: admin.id,
                  type: 'system',
                  title: '⚠️ Chat age rating review',
                  message: `Open Chat message may need review: "${preview}${message.content.length > 50 ? '…' : ''}". Check Admin → Chat.`,
                  link: '/admin?tab=chat',
                },
              })
            }
          } else {
            await prisma.chatMessage.update({
              where: { id: message.id },
              data: { contentInspectionStatus: 'pass' },
            })
          }
        } catch (e) {
          console.error('Chat content inspection failed:', e)
        }
      }
      runInspection().catch((e) => console.error('Chat inspection promise rejected:', e))
    }

    // Create notification ONLY for private message recipient
    // Open/Public chat messages do NOT trigger notifications
    if (isPrivate && recipientId) {
      const senderName = session.user.username || session.user.name || 'Someone'
      
      // Check if there's already an unread notification from this sender
      const existingNotification = await prisma.notification.findFirst({
        where: {
          userId: recipientId,
          type: 'private_chat',
          link: session.user.id,
          read: false,
        },
      })
      
      // Only create notification if one doesn't already exist
      if (!existingNotification) {
        await prisma.notification.create({
          data: {
            userId: recipientId,
            type: 'private_chat',
            title: 'New My Kong',
            message: `${senderName} invited you to My Kong`,
            link: session.user.id, // Store sender's ID to open chat with them
            read: false,
          },
        })
      }
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Error sending chat message:', error)
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    )
  }
}

