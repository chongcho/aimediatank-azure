import { prisma } from '@/lib/prisma'

/** Unread TalkChat messages + valid pending chat invites for a user. */
export async function getChatUnreadCountForUser(userId: string): Promise<number> {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    select: {
      conversationId: true,
      lastReadAt: true,
    },
  })

  let totalUnread = 0

  for (const membership of memberships) {
    const unreadCount = await prisma.chatMessage.count({
      where: {
        conversationId: membership.conversationId,
        userId: { not: userId },
        createdAt: membership.lastReadAt ? { gt: membership.lastReadAt } : undefined,
      },
    })
    totalUnread += unreadCount
  }

  const inviteNotifications = await prisma.notification.findMany({
    where: {
      userId,
      type: 'private_chat',
      read: false,
      link: { not: null },
    },
    select: { link: true },
  })

  let validInviteCount = 0
  for (const notif of inviteNotifications) {
    if (!notif.link) continue
    const senderExists = await prisma.user.findUnique({
      where: { id: notif.link },
      select: { id: true },
    })
    if (senderExists) {
      validInviteCount += 1
    }
  }

  return totalUnread + validInviteCount
}
