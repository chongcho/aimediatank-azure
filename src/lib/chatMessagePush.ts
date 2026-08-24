import { sendIosChatMessageAlertPushToUser } from '@/lib/apnsAlertPush'
import { sendAndroidChatMessagePushToUser } from '@/lib/fcmPush'
import { sendChatMessageWebPushToUser, type ChatMessagePushPayload } from '@/lib/webPush'

/** Deliver chat message alert to recipient devices (Web Push + Android FCM + iOS APNs alert). */
export async function sendChatMessagePushToUser(
  userId: string,
  payload: ChatMessagePushPayload,
): Promise<void> {
  await Promise.all([
    sendChatMessageWebPushToUser(userId, payload),
    sendAndroidChatMessagePushToUser(userId, payload),
    sendIosChatMessageAlertPushToUser(userId, payload),
  ])
}

function chatMessagePreview(content: string): string {
  return content.length > 120 ? `${content.slice(0, 117)}…` : content
}

/** OS push for private conversation messages (TalkChat primary path). */
export async function notifyConversationMessageRecipients(params: {
  conversationId: string
  senderId: string
  senderName: string
  content: string
  recipientUserIds: string[]
}): Promise<void> {
  const { conversationId, senderId, senderName, content, recipientUserIds } = params
  if (recipientUserIds.length === 0) return

  const payload: ChatMessagePushPayload = {
    type: 'chat_message',
    senderId,
    title: senderName,
    body: chatMessagePreview(content),
    url: `/?openChat=1&conversationId=${encodeURIComponent(conversationId)}`,
  }

  await Promise.all(recipientUserIds.map((userId) => sendChatMessagePushToUser(userId, payload)))
}
