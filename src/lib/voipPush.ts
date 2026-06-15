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

const apnsClients = new Map<'production' | 'sandbox', ApnsClient>()

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

/** TestFlight / App Store VoIP tokens require production APNs unless APNS_PRODUCTION=false. */
export function apnsProductionEnabled(): boolean {
  const raw = process.env.APNS_PRODUCTION?.trim().toLowerCase()
  if (raw === 'true' || raw === '1' || raw === 'yes') return true
  if (raw === 'false' || raw === '0' || raw === 'no') return false
  return process.env.NODE_ENV === 'production'
}

function getApnsClient(production = apnsProductionEnabled()): ApnsClient | null {
  if (!isVoipPushConfigured()) return null

  const cacheKey = production ? 'production' : 'sandbox'
  const cached = apnsClients.get(cacheKey)
  if (cached) return cached

  const signingKey = readSigningKey()
  if (!signingKey) return null

  const client = new ApnsClient({
    team: process.env.APNS_TEAM_ID!,
    keyId: process.env.APNS_KEY_ID!,
    signingKey,
    defaultTopic: `${process.env.APNS_BUNDLE_ID}.voip`,
    host: production ? 'api.push.apple.com' : 'api.sandbox.push.apple.com',
  })
  apnsClients.set(cacheKey, client)
  if (apnsClients.size === 1) {
    console.info(
      `[VoIP] APNs client host=${production ? 'production' : 'sandbox'} (APNS_PRODUCTION=${process.env.APNS_PRODUCTION ?? 'auto'})`,
    )
  }
  return client
}

type VoipPushSendResult = {
  sent: number
  staleTokens: string[]
  badDeviceTokens: string[]
  otherErrors: string[]
}

async function sendVoipNotifications(
  client: ApnsClient,
  tokens: { token: string }[],
  data: Record<string, unknown>,
  logLabel: string,
  extraOptions: { contentAvailable?: boolean } = {},
): Promise<VoipPushSendResult> {
  const topic = `${process.env.APNS_BUNDLE_ID}.voip`
  const notifications = tokens.map(
    (row) =>
      new Notification(row.token, {
        type: PushType.voip,
        topic,
        priority: Priority.immediate,
        ...(extraOptions.contentAvailable ? { contentAvailable: true } : {}),
        data,
      }),
  )

  const staleTokens: string[] = []
  const badDeviceTokens: string[] = []
  const otherErrors: string[] = []
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
      const tokenPrefix = tokens[index]?.token.slice(0, 8) ?? '?'
      if (reason === 'BadDeviceToken') {
        badDeviceTokens.push(tokens[index]!.token)
      } else if (reason === 'Unregistered' || reason === 'ExpiredToken') {
        staleTokens.push(tokens[index]!.token)
      } else {
        otherErrors.push(`${reason} (${tokenPrefix})`)
        console.error(`VoIP push failed (${logLabel}):`, reason, tokenPrefix)
      }
    })
  } catch (error) {
    console.error(`VoIP push batch failed (${logLabel}):`, error)
  }

  return { sent, staleTokens, badDeviceTokens, otherErrors }
}

async function sendVoipDataPushToUser(
  userId: string,
  data: Record<string, unknown>,
  logLabel: string,
  extraOptions: { contentAvailable?: boolean } = {},
): Promise<void> {
  const primaryProduction = apnsProductionEnabled()
  const client = getApnsClient(primaryProduction)
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

  let result = await sendVoipNotifications(client, tokens, data, logLabel, extraOptions)

  // Wrong APNs environment returns BadDeviceToken — retry the alternate host before dropping tokens.
  if (
    result.sent === 0 &&
    result.badDeviceTokens.length === tokens.length &&
    result.otherErrors.length === 0
  ) {
    const alternateClient = getApnsClient(!primaryProduction)
    if (alternateClient) {
      console.warn(
        `[VoIP] ${logLabel}: all tokens rejected on ${primaryProduction ? 'production' : 'sandbox'} APNs; retrying ${!primaryProduction ? 'production' : 'sandbox'}`,
      )
      result = await sendVoipNotifications(alternateClient, tokens, data, `${logLabel} (alt host)`, extraOptions)
    }
  }

  if (result.sent > 0) {
    console.info(`[VoIP] ${logLabel}: sent to ${result.sent}/${tokens.length} device(s)`)
  } else if (tokens.length > 0) {
    console.warn(`[VoIP] ${logLabel}: failed for all ${tokens.length} device(s)`)
  }

  const staleTokens = Array.from(new Set([...result.staleTokens, ...result.badDeviceTokens]))
  if (staleTokens.length > 0) {
    await prisma.voipPushToken.deleteMany({
      where: { token: { in: staleTokens } },
    })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Gaps between cancel VoIP pushes (ms). Lock-screen delivery can lag; repeat improves odds. */
const CANCEL_PUSH_RETRY_GAPS_MS = [400, 600, 1000, 1500, 2500, 3500, 5000, 8000] as const

/** Retries awaited before the HTTP handler returns (covers ~3.5s without blocking the caller too long). */
const CANCEL_PUSH_AWAITED_RETRIES = 4

/** Total cancel VoIP pushes per caller hangup (1 immediate + all retry gaps). */
export function plannedVoipCancelPushAttempts(): number {
  return 1 + CANCEL_PUSH_RETRY_GAPS_MS.length
}

/** Dismiss CallKit on callee device when caller cancels while ringing (sleep mode). */
export async function sendVoipCallCancelPushToUser(userId: string, callId: string): Promise<void> {
  const normalizedCallId = normalizeVoiceCallId(callId)
  if (!normalizedCallId) return
  // VoIP pushes must stay on PushType.voip — content-available makes iOS treat them as
  // silent background pushes and they may not wake CallKit to dismiss the lock-screen ring.
  await sendVoipDataPushToUser(
    userId,
    { action: 'cancel', callId: normalizedCallId },
    `cancel push for call ${normalizedCallId}`,
  )
}

/**
 * Send cancel VoIP pushes repeatedly. Quick retries are awaited so they are not lost when the
 * serverless/runtime freezes after the response; longer retries continue in the background.
 */
export async function sendVoipCallCancelPushBurstToUser(userId: string, callId: string): Promise<void> {
  const normalizedCallId = normalizeVoiceCallId(callId)
  if (!normalizedCallId) return

  const data = { action: 'cancel', callId: normalizedCallId }
  let attempt = 0

  const sendOnce = async () => {
    attempt += 1
    await sendVoipDataPushToUser(
      userId,
      data,
      `cancel push for call ${normalizedCallId} (#${attempt})`,
    )
  }

  const runRetriesFrom = async (startIndex: number) => {
    for (let i = startIndex; i < CANCEL_PUSH_RETRY_GAPS_MS.length; i++) {
      await sleep(CANCEL_PUSH_RETRY_GAPS_MS[i]!)
      try {
        await sendOnce()
      } catch (err) {
        console.error(`[VoIP] cancel push retry #${attempt} failed for ${normalizedCallId}:`, err)
      }
    }
  }

  try {
    await sendOnce()
  } catch (err) {
    console.error(`[VoIP] cancel push #1 failed for ${normalizedCallId}:`, err)
  }

  const awaitedEnd = Math.min(CANCEL_PUSH_AWAITED_RETRIES, CANCEL_PUSH_RETRY_GAPS_MS.length)
  for (let i = 0; i < awaitedEnd; i++) {
    await sleep(CANCEL_PUSH_RETRY_GAPS_MS[i]!)
    try {
      await sendOnce()
    } catch (err) {
      console.error(`[VoIP] cancel push retry #${attempt} failed for ${normalizedCallId}:`, err)
    }
  }

  if (awaitedEnd < CANCEL_PUSH_RETRY_GAPS_MS.length) {
    void runRetriesFrom(awaitedEnd)
  }
}

/** Gaps between incoming VoIP pushes (ms). One push can be dropped on Doze / flaky APNs. */
const INCOMING_PUSH_RETRY_GAPS_MS = [0, 900, 1800] as const

/** Send PushKit VoIP push so iOS native app shows CallKit on lock screen. */
export async function sendVoipCallPushToUser(
  userId: string,
  payload: VoipCallPushPayload,
  burstAttempt?: { index: number; total: number },
): Promise<void> {
  const callId = normalizeVoiceCallId(payload.callId)
  if (!callId) return
  const declineToken = createVoiceCallDeclineToken(callId)
  if (!declineToken) {
    console.warn(`[VoIP] incoming push for ${callId}: no decline token (set NEXTAUTH_SECRET on server)`)
  }
  const logLabel = burstAttempt
    ? `incoming push #${burstAttempt.index}/${burstAttempt.total} for call ${callId}`
    : `incoming push for call ${callId}`
  await sendVoipDataPushToUser(
    userId,
    {
      callId,
      handle: payload.handle,
      displayName: payload.displayName,
      handleType: 'generic',
      video: false,
      ...(declineToken ? { declineToken } : {}),
      metadata: {
        callerId: payload.caller.id,
        callerUsername: payload.caller.username,
        callerName: payload.caller.name,
        callerAvatar: payload.caller.avatar,
        ...(declineToken ? { declineToken } : {}),
      },
    },
    logLabel,
  )
}

/** Repeat incoming VoIP pushes (Android FCM uses a similar burst for lock-screen delivery). */
export async function sendVoipCallPushBurstToUser(
  userId: string,
  payload: VoipCallPushPayload,
): Promise<void> {
  const total = INCOMING_PUSH_RETRY_GAPS_MS.length
  for (let i = 0; i < total; i++) {
    const gap = INCOMING_PUSH_RETRY_GAPS_MS[i]!
    if (gap > 0) await sleep(gap)
    try {
      await sendVoipCallPushToUser(userId, payload, { index: i + 1, total })
    } catch (err) {
      console.error(`[VoIP] incoming burst #${i + 1}/${total} failed for ${payload.callId}:`, err)
    }
  }
}
