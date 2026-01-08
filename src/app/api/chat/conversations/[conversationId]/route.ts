import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// PATCH - Update conversation (e.g., rename)
export async function PATCH(
  request: Request,
  { params }: { params: { conversationId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { conversationId } = params
    const { name } = await request.json()

    // Verify user is a member of this conversation
    const membership = await prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId: session.user.id,
      },
    })

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this conversation' }, { status: 403 })
    }

    // Update conversation name
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { name: name || null },
    })

    return NextResponse.json({ success: true, conversation: updated })
  } catch (error) {
    console.error('Error updating conversation:', error)
    return NextResponse.json(
      { error: 'Failed to update conversation' },
      { status: 500 }
    )
  }
}

// DELETE - Leave conversation (remove membership)
export async function DELETE(
  request: Request,
  { params }: { params: { conversationId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { conversationId } = params

    // Verify user is a member of this conversation
    const membership = await prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId: session.user.id,
      },
    })

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this conversation' }, { status: 403 })
    }

    // Remove user from conversation
    await prisma.conversationMember.delete({
      where: { id: membership.id },
    })

    // Check if conversation has no more members
    const remainingMembers = await prisma.conversationMember.count({
      where: { conversationId },
    })

    // If no members left, delete the conversation and its messages
    if (remainingMembers === 0) {
      await prisma.chatMessage.deleteMany({
        where: { conversationId },
      })
      await prisma.conversation.delete({
        where: { id: conversationId },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error leaving conversation:', error)
    return NextResponse.json(
      { error: 'Failed to leave conversation' },
      { status: 500 }
    )
  }
}
