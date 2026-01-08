import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Get user's conversations
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all conversations where user is a member
    const conversations = await prisma.conversation.findMany({
      where: {
        members: {
          some: {
            userId: session.user.id,
          },
        },
      },
      include: {
        members: {
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
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    // Transform to include last message, other members, and unread count
    const transformedConversations = await Promise.all(
      conversations.map(async (conv) => {
        const otherMembers = conv.members
          .filter((m) => m.userId !== session.user.id)
          .map((m) => m.user)
        
        // Get current user's membership to find lastReadAt
        const currentUserMember = conv.members.find((m) => m.userId === session.user.id)
        const lastReadAt = currentUserMember?.lastReadAt
        
        // Count unread messages (messages after lastReadAt, not sent by current user)
        const unreadCount = await prisma.chatMessage.count({
          where: {
            conversationId: conv.id,
            userId: { not: session.user.id },
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          },
        })
        
        return {
          id: conv.id,
          name: conv.name,
          isGroup: conv.isGroup,
          members: otherMembers,
          lastMessage: conv.messages[0] || null,
          updatedAt: conv.updatedAt,
          unreadCount,
        }
      })
    )

    return NextResponse.json({ conversations: transformedConversations })
  } catch (error) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    )
  }
}

// POST - Create or find a conversation
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { memberIds, name } = await request.json()

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one member is required' },
        { status: 400 }
      )
    }

    // Add current user to members (deduplicate)
    const memberSet = new Set<string>([session.user.id, ...memberIds])
    const allMemberIds = Array.from(memberSet)
    const isGroup = allMemberIds.length > 2

    // For 1-on-1 chats, check if conversation already exists
    if (!isGroup) {
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          isGroup: false,
          AND: allMemberIds.map((id) => ({
            members: {
              some: { userId: id },
            },
          })),
          members: {
            every: {
              userId: { in: allMemberIds },
            },
          },
        },
        include: {
          members: {
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
          },
        },
      })

      if (existingConversation) {
        const otherMembers = existingConversation.members
          .filter((m) => m.userId !== session.user.id)
          .map((m) => m.user)

        return NextResponse.json({
          conversation: {
            id: existingConversation.id,
            name: existingConversation.name,
            isGroup: existingConversation.isGroup,
            members: otherMembers,
          },
          isNew: false,
        })
      }
    }

    // Create new conversation
    const conversation = await prisma.conversation.create({
      data: {
        name: isGroup ? name || null : null,
        isGroup,
        members: {
          create: allMemberIds.map((userId) => ({
            userId,
          })),
        },
      },
      include: {
        members: {
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
        },
      },
    })

    const otherMembers = conversation.members
      .filter((m) => m.userId !== session.user.id)
      .map((m) => m.user)

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        name: conversation.name,
        isGroup: conversation.isGroup,
        members: otherMembers,
      },
      isNew: true,
    })
  } catch (error) {
    console.error('Error creating conversation:', error)
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    )
  }
}

