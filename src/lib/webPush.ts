import webpush from 'web-push'
import { prisma } from '@/lib/prisma'

export interface VoiceCallPushPayload {
  type: 'voice_call'
  callId: string
  caller: {
    id: string
    username: string
    name: string | null
    avatar: string | null
  }
  title: string
  body: string
  url: string
}

let vapidConfigured = false

export function isWebPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

function ensureVapidConfigured() {
  if (vapidConfigured || !isWebPushConfigured()) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:support@aimediatank.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  vapidConfigured = true
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null
}

export async function sendVoiceCallPushToUser(
  userId: string,
  payload: VoiceCallPushPayload,
): Promise<void> {
  if (!isWebPushConfigured()) return

  ensureVapidConfigured()

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  })
  if (subscriptions.length === 0) return

  const body = JSON.stringify(payload)
  const staleEndpoints: string[] = []

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          {
            TTL: 60,
            urgency: 'high',
          },
        )
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          staleEndpoints.push(sub.endpoint)
        }
      }
    }),
  )

  if (staleEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: staleEndpoints } },
    })
  }
}
