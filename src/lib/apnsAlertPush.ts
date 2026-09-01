import fs from 'fs'
import { ApnsClient, ApnsError, Notification, Priority, PushType } from 'apns2'
import { getChatUnreadCountForUser } from '@/lib/chatUnreadCount'
import { prisma } from '@/lib/prisma'
import type { ChatMessagePushPayload } from '@/lib/webPush'
import { apnsProductionEnabled, isVoipPushConfigured } from '@/lib/voipPush'

const alertApnsClients = new Map<'production' | 'sandbox', ApnsClient>()

function normalizeApnsSigningKey(raw: string): string {
  let key = raw.replace(/\\n/g, '\n').trim()
  if (!key.includes('BEGIN PRIVATE KEY')) return key

  if (!key.includes('\n-----BEGIN') && !key.includes('-----\n')) {
    key = key
      .replace(/-----BEGIN PRIVATE KEY-----/g, '-----BEGIN PRIVATE KEY-----\n')
      .replace(/-----END PRIVATE KEY-----/g, '\n-----END PRIVATE KEY-----\n')
  }

  return key
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('-----')) return trimmed
      return trimmed.replace(/\s+/g, '')
    })
    .filter(Boolean)
    .join('\n')
}

function readSigningKey(): Buffer | null {
  const inline = process.env.APNS_SIGNING_KEY
  if (inline) {
    return Buffer.from(normalizeApnsSigningKey(inline), 'utf8')
  }

  const path = process.env.APNS_SIGNING_KEY_PATH
  if (!path) return null

  try {
    return fs.readFileSync(path)
  } catch {
    return null
  }
}

function getAlertApnsClient(production = apnsProductionEnabled()): ApnsClient | null {
  if (!isVoipPushConfigured()) return null

  const cacheKey = production ? 'production' : 'sandbox'
  const cached = alertApnsClients.get(cacheKey)
  if (cached) return cached

  const signingKey = readSigningKey()
  if (!signingKey) return null

  const client = new ApnsClient({
    team: process.env.APNS_TEAM_ID!,
    keyId: process.env.APNS_KEY_ID!,
    signingKey,
    defaultTopic: process.env.APNS_BUNDLE_ID!,
    host: production ? 'api.push.apple.com' : 'api.sandbox.push.apple.com',
  })
  alertApnsClients.set(cacheKey, client)
  return client
}

type IosAlertApnsSendResult = {
  sent: number
  staleTokens: string[]
  badDeviceTokens: string[]
}

async function sendIosAlertApnsNotifications(
  userId: string,
  buildNotification: (token: string) => Notification,
  logLabel: string,
): Promise<IosAlertApnsSendResult> {
  const primaryProduction = apnsProductionEnabled()
  const client = getAlertApnsClient(primaryProduction)
  if (!client) {
    console.warn(`[APNsAlert] ${logLabel} skipped: APNS not configured`)
    return { sent: 0, staleTokens: [], badDeviceTokens: [] }
  }

  const tokens = await prisma.voipPushToken.findMany({
    where: { userId, platform: 'ios_alert' },
    orderBy: { updatedAt: 'desc' },
  })
  if (tokens.length === 0) {
    console.warn(`[APNsAlert] ${logLabel} skipped: no ios_alert token for user ${userId}`)
    return { sent: 0, staleTokens: [], badDeviceTokens: [] }
  }

  const notifications = tokens.map((row) => buildNotification(row.token))
  const staleTokens: string[] = []
  const badDeviceTokens: string[] = []
  let sent = 0

  const sendBatch = async (apnsClient: ApnsClient) => {
    const results = await apnsClient.sendMany(notifications)
    results.forEach((result, index) => {
      if (result && typeof result === 'object' && !('error' in result)) {
        sent += 1
        return
      }
      if (!(result && typeof result === 'object' && 'error' in result)) return
      const error = result.error
      const reason = error instanceof ApnsError ? error.reason : String(error)
      const tokenPrefix = tokens[index]?.token.slice(0, 8) ?? '?'
      if (reason === 'BadDeviceToken') {
        badDeviceTokens.push(tokens[index]!.token)
      } else if (reason === 'Unregistered' || reason === 'ExpiredToken') {
        staleTokens.push(tokens[index]!.token)
      } else {
        console.error(`[APNsAlert] ${logLabel} failed (${reason}) token=${tokenPrefix}`)
      }
    })
  }

  try {
    await sendBatch(client)
  } catch (error) {
    console.error(`[APNsAlert] ${logLabel} batch failed:`, error)
  }

  if (sent === 0 && badDeviceTokens.length === tokens.length && tokens.length > 0) {
    const alternateClient = getAlertApnsClient(!primaryProduction)
    if (alternateClient) {
      console.warn(
        `[APNsAlert] ${logLabel}: retrying ${!primaryProduction ? 'production' : 'sandbox'} APNs host`,
      )
      try {
        await sendBatch(alternateClient)
      } catch (error) {
        console.error(`[APNsAlert] ${logLabel} alternate host failed:`, error)
      }
    }
  }

  if (sent > 0) {
    console.info(`[APNsAlert] ${logLabel} sent to ${sent}/${tokens.length} device(s)`)
  }

  const remove = Array.from(new Set([...staleTokens, ...badDeviceTokens]))
  if (remove.length > 0) {
    await prisma.voipPushToken.deleteMany({
      where: { token: { in: remove } },
    })
  }

  return { sent, staleTokens, badDeviceTokens }
}

/** Silent APNs badge update for iOS native app (no banner/sound). */
export async function sendIosBadgeUpdateToUser(userId: string, badge: number): Promise<void> {
  const topic = process.env.APNS_BUNDLE_ID!
  const safeBadge = Math.max(0, badge)

  await sendIosAlertApnsNotifications(
    userId,
    (token) =>
      new Notification(token, {
        type: PushType.alert,
        topic,
        priority: Priority.low,
        badge: safeBadge,
      }),
    `badge_update(${safeBadge})`,
  )
}

/** APNs alert push for private chat on iOS native app (not PushKit VoIP). */
export async function sendIosChatMessageAlertPushToUser(
  userId: string,
  payload: ChatMessagePushPayload,
): Promise<void> {
  const badge = await getChatUnreadCountForUser(userId)
  const topic = process.env.APNS_BUNDLE_ID!

  await sendIosAlertApnsNotifications(
    userId,
    (token) =>
      new Notification(token, {
        type: PushType.alert,
        topic,
        priority: Priority.immediate,
        alert: {
          title: payload.title,
          body: payload.body,
        },
        sound: 'default',
        badge,
        data: {
          type: payload.type,
          senderId: payload.senderId,
          url: payload.url,
          title: payload.title,
          body: payload.body,
        },
      }),
    'chat_message',
  )
}
