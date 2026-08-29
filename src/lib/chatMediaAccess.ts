import { prisma } from '@/lib/prisma'

export function chatMessageReferencesMediaId(content: string, mediaId: string): boolean {
  return (
    content.includes(`[[media:${mediaId}]]`) ||
    content.includes(`/media/${mediaId}`)
  )
}

function mediaMarkerOrClauses(mediaIds: string[]) {
  return mediaIds.flatMap((id) => [
    { content: { contains: `[[media:${id}]]` } },
    { content: { contains: `/media/${id}` } },
  ])
}

function collectReferencedIds(messages: { content: string }[], mediaIds: string[]): Set<string> {
  const shared = new Set<string>()
  for (const msg of messages) {
    for (const id of mediaIds) {
      if (chatMessageReferencesMediaId(msg.content, id)) {
        shared.add(id)
      }
    }
  }
  return shared
}

/** Media attached in Pub Chat (open messages) — readable by anyone who can load open chat. */
export async function mediaIdsInOpenChat(mediaIds: string[]): Promise<Set<string>> {
  if (mediaIds.length === 0) return new Set()
  const messages = await prisma.chatMessage.findMany({
    where: {
      isPrivate: false,
      OR: mediaMarkerOrClauses(mediaIds),
    },
    select: { content: true },
    take: 100,
  })
  return collectReferencedIds(messages, mediaIds)
}

/** Media shared in private/group conversations the user belongs to. */
export async function mediaIdsInUserConversations(
  userId: string,
  mediaIds: string[],
): Promise<Set<string>> {
  if (mediaIds.length === 0) return new Set()

  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    select: { conversationId: true },
  })
  const conversationIds = memberships.map((m) => m.conversationId)
  if (conversationIds.length === 0) return new Set()

  const messages = await prisma.chatMessage.findMany({
    where: {
      conversationId: { in: conversationIds },
      OR: mediaMarkerOrClauses(mediaIds),
    },
    select: { content: true },
    take: 100,
  })
  return collectReferencedIds(messages, mediaIds)
}

/** Open-chat + private conversation access for chat attachment previews. */
export async function getChatAccessibleMediaIds(
  userId: string | null | undefined,
  mediaIds: string[],
): Promise<Set<string>> {
  const [openChatIds, conversationIds] = await Promise.all([
    mediaIdsInOpenChat(mediaIds),
    userId ? mediaIdsInUserConversations(userId, mediaIds) : Promise.resolve(new Set<string>()),
  ])
  return new Set([...Array.from(openChatIds), ...Array.from(conversationIds)])
}
