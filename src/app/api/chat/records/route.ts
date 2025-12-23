import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Find all unique users the current user has had private chats with
    // Get messages where current user is sender or recipient
    const privateMessages = await prisma.chatMessage.findMany({
      where: {
        isPrivate: true,
        OR: [
          { userId: userId },
          { recipientId: userId },
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            avatar: true,
          },
        },
      },
    })

    // Collect all unique recipient IDs to fetch their user data
    const recipientIds = new Set<string>()
    for (const msg of privateMessages) {
      if (msg.recipientId && msg.recipientId !== userId) {
        recipientIds.add(msg.recipientId)
      }
    }

    // Fetch recipient user data
    const recipientUsers = await prisma.user.findMany({
      where: {
        id: { in: Array.from(recipientIds) },
      },
      select: {
        id: true,
        username: true,
        name: true,
        avatar: true,
      },
    })

    // Create a map for quick lookup
    const recipientMap = new Map(recipientUsers.map(u => [u.id, u]))

    // Group by conversation partner and get the latest message
    const conversationMap = new Map<string, {
      user: {
        id: string
        username: string
        name: string | null
        avatar: string | null
      }
      lastMessage: string
      lastMessageAt: string
    }>()

    for (const msg of privateMessages) {
      // Determine the other user in the conversation
      let otherUser: { id: string; username: string; name: string | null; avatar: string | null } | null = null
      
      if (msg.userId === userId && msg.recipientId) {
        // Current user is sender, get recipient
        otherUser = recipientMap.get(msg.recipientId) || null
      } else if (msg.userId !== userId) {
        // Current user is recipient, get sender
        otherUser = msg.user
      }
      
      if (!otherUser || !otherUser.id) continue

      // Only add if we haven't seen this user yet (since messages are ordered by date desc)
      if (!conversationMap.has(otherUser.id)) {
        conversationMap.set(otherUser.id, {
          user: {
            id: otherUser.id,
            username: otherUser.username || '',
            name: otherUser.name,
            avatar: otherUser.avatar,
          },
          lastMessage: msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content,
          lastMessageAt: msg.createdAt.toISOString(),
        })
      }
    }

    const records = Array.from(conversationMap.values())

    return NextResponse.json({ records })
  } catch (error) {
    console.error('Error fetching chat records:', error)
    return NextResponse.json({ error: 'Failed to fetch chat records' }, { status: 500 })
  }
}

