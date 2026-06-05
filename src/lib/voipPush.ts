import fs from 'fs'
import { ApnsClient, ApnsError, Notification, Priority, PushType } from 'apns2'
import { prisma } from '@/lib/prisma'

export interface VoipCallPushPayload {
  callId: string
  caller: {
    id: string
    username: string
    name: string | null
    avatar: string | null
  }
  displayName: string
  handle: string
}

let apnsClient: ApnsClient | null = null

export function isVoipPushConfigured(): boolean {
  return Boolean(
    process.env.APNS_TEAM_ID &&
      process.env.APNS_KEY_ID &&
      process.env.APNS_BUNDLE_ID &&
      (process.env.APNS_SIGNING_KEY || process.env.APNS_SIGNING_KEY_PATH),
  )
}

function readSigningKey(): Buffer | null {
  const inline = process.env.APNS_SIGNING_KEY
  if (inline) {
    return Buffer.from(inline.replace(/\\n/g, '\n'), 'utf8')
  }

  const path = process.env.APNS_SIGNING_KEY_PATH
  if (!path) return null

  try {
    return fs.readFileSync(path)
  } catch {
    return null
  }
}

function getApnsClient(): ApnsClient | null {
  if (!isVoipPushConfigured()) return null
  if (apnsClient) return apnsClient

  const signingKey = readSigningKey()
  if (!signingKey) return null

  apnsClient = new ApnsClient({
    team: process.env.APNS_TEAM_ID!,
    keyId: process.env.APNS_KEY_ID!,
    signingKey,
    defaultTopic: `${process.env.APNS_BUNDLE_ID}.voip`,
    host: process.env.APNS_PRODUCTION === 'true' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com',
  })

  return apnsClient
}

/** Send PushKit VoIP push so iOS native app shows CallKit on lock screen. */
export async function sendVoipCallPushToUser(
  userId: string,
  payload: VoipCallPushPayload,
): Promise<void> {
  const client = getApnsClient()
  if (!client) return

  const tokens = await prisma.voipPushToken.findMany({
    where: { userId, platform: 'ios' },
  })
  if (tokens.length === 0) return

  const topic = `${process.env.APNS_BUNDLE_ID}.voip`
  const notifications = tokens.map(
    (row) =>
      new Notification(row.token, {
        type: PushType.voip,
        topic,
        priority: Priority.immediate,
        data: {
          callId: payload.callId,
          handle: payload.handle,
          displayName: payload.displayName,
          handleType: 'generic',
          video: false,
          metadata: {
            callerId: payload.caller.id,
            callerUsername: payload.caller.username,
            callerName: payload.caller.name,
            callerAvatar: payload.caller.avatar,
          },
        },
      }),
  )

  const staleTokens: string[] = []

  try {
    const results = await client.sendMany(notifications)
    results.forEach((result, index) => {
      if (!(result && typeof result === 'object' && 'error' in result)) return
      const error = result.error
      const reason = error instanceof ApnsError ? error.reason : String(error)
      if (reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'ExpiredToken') {
        staleTokens.push(tokens[index]!.token)
      } else {
        console.error('VoIP push failed:', reason, tokens[index]?.token.slice(0, 8))
      }
    })
  } catch (error) {
    console.error('VoIP push batch failed:', error)
  }

  if (staleTokens.length > 0) {
    await prisma.voipPushToken.deleteMany({
      where: { token: { in: staleTokens } },
    })
  }
}
