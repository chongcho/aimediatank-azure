import fs from 'fs'
import { ApnsClient, ApnsError, Notification, Priority, PushType } from 'apns2'
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

/** APNs alert push for private chat on iOS native app (not PushKit VoIP). */
export async function sendIosChatMessageAlertPushToUser(
  userId: string,
  payload: ChatMessagePushPayload,
): Promise<void> {
  const primaryProduction = apnsProductionEnabled()
  const client = getAlertApnsClient(primaryProduction)
  if (!client) {
    console.warn('[APNsAlert] chat_message skipped: APNS not configured')
    return
  }

  const tokens = await prisma.voipPushToken.findMany({
    where: { userId, platform: 'ios_alert' },
    orderBy: { updatedAt: 'desc' },
  })
  if (tokens.length === 0) {
    console.warn(`[APNsAlert] chat_message skipped: no ios_alert token for user ${userId}`)
    return
  }

  const topic = process.env.APNS_BUNDLE_ID!
  const notifications = tokens.map(
    (row) =>
      new Notification(row.token, {
        type: PushType.alert,
        topic,
        priority: Priority.immediate,
        alert: {
          title: payload.title,
          body: payload.body,
        },
        sound: 'default',
        badge: 1,
        data: {
          type: payload.type,
          senderId: payload.senderId,
          url: payload.url,
          title: payload.title,
          body: payload.body,
        },
      }),
  )

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
        console.error(`[APNsAlert] chat_message failed (${reason}) token=${tokenPrefix}`)
      }
    })
  }

  try {
    await sendBatch(client)
  } catch (error) {
    console.error('[APNsAlert] chat_message batch failed:', error)
  }

  if (
    sent === 0 &&
    badDeviceTokens.length === tokens.length &&
    tokens.length > 0
  ) {
    const alternateClient = getAlertApnsClient(!primaryProduction)
    if (alternateClient) {
      console.warn(
        `[APNsAlert] chat_message: retrying ${!primaryProduction ? 'production' : 'sandbox'} APNs host`,
      )
      try {
        await sendBatch(alternateClient)
      } catch (error) {
        console.error('[APNsAlert] chat_message alternate host failed:', error)
      }
    }
  }

  if (sent > 0) {
    console.info(`[APNsAlert] chat_message sent to ${sent}/${tokens.length} device(s)`)
  }

  const remove = Array.from(new Set([...staleTokens, ...badDeviceTokens]))
  if (remove.length > 0) {
    await prisma.voipPushToken.deleteMany({
      where: { token: { in: remove } },
    })
  }
}
