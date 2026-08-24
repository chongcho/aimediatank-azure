import { sendAndroidChatMessagePushToUser } from '@/lib/fcmPush'
import { sendChatMessageWebPushToUser, type ChatMessagePushPayload } from '@/lib/webPush'

/** Deliver chat message alert to recipient devices (Web Push + Android FCM). */
export async function sendChatMessagePushToUser(
  userId: string,
  payload: ChatMessagePushPayload,
): Promise<void> {
  await Promise.all([
    sendChatMessageWebPushToUser(userId, payload),
    sendAndroidChatMessagePushToUser(userId, payload),
  ])
}
