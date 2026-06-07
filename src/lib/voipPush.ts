import fs from 'fs'
import { createVoiceCallDeclineToken } from '@/lib/voiceCallDeclineToken'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'
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

async function sendVoipDataPushToUser(
  userId: string,
  data: Record<string, unknown>,
  logLabel: string,
): Promise<void> {
  const client = getApnsClient()
  if (!client) {
    console.warn(`VoIP push skipped (${logLabel}): APNS env vars not configured`)
    return
  }

  const tokens = await prisma.voipPushToken.findMany({
    where: { userId, platform: 'ios' },
  })
  if (tokens.length === 0) {
    console.warn(`VoIP push skipped (${logLabel}): no iOS VoIP token for user ${userId}`)
    return
  }

  const topic = `${process.env.APNS_BUNDLE_ID}.voip`
  const notifications = tokens.map(
    (row) =>
      new Notification(row.token, {
        type: PushType.voip,
        topic,
        priority: Priority.immediate,
        data,
      }),
  )

  const staleTokens: string[] = []
  let sent = 0

  try {
    const results = await client.sendMany(notifications)
    results.forEach((result, index) => {
      if (result && typeof result === 'object' && !('error' in result)) {
        sent += 1
        return
      }
      if (!(result && typeof result === 'object' && 'error' in result)) return
      const error = result.error
      const reason = error instanceof ApnsError ? error.reason : String(error)
      if (reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'ExpiredToken') {
        staleTokens.push(tokens[index]!.token)
      } else {
        console.error(`VoIP push failed (${logLabel}):`, reason, tokens[index]?.token.slice(0, 8))
      }
    })
  } catch (error) {
    console.error(`VoIP push batch failed (${logLabel}):`, error)
  }

  if (sent > 0) {
    console.info(`[VoIP] ${logLabel}: sent to ${sent}/${tokens.length} device(s)`)
  } else if (tokens.length > 0) {
    console.warn(`[VoIP] ${logLabel}: failed for all ${tokens.length} device(s)`)
  }

  if (staleTokens.length > 0) {
    await prisma.voipPushToken.deleteMany({
      where: { token: { in: staleTokens } },
    })
  }
}

/** Dismiss CallKit on callee device when caller cancels while ringing (sleep mode). */
export async function sendVoipCallCancelPushToUser(userId: string, callId: string): Promise<void> {
  const normalizedCallId = normalizeVoiceCallId(callId)
  if (!normalizedCallId) return
  await sendVoipDataPushToUser(
    userId,
    { action: 'cancel', callId: normalizedCallId },
    `cancel push for call ${normalizedCallId}`,
  )
}

/** Send PushKit VoIP push so iOS native app shows CallKit on lock screen. */
export async function sendVoipCallPushToUser(
  userId: string,
  payload: VoipCallPushPayload,
): Promise<void> {
  const declineToken = createVoiceCallDeclineToken(payload.callId)
  await sendVoipDataPushToUser(
    userId,
    {
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
        ...(declineToken ? { declineToken } : {}),
      },
    },
    `incoming push for call ${payload.callId}`,
  )
}
