import fs from 'fs'
import admin from 'firebase-admin'
import { prisma } from '@/lib/prisma'
import { createVoiceCallDeclineToken } from '@/lib/voiceCallDeclineToken'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'
import {
  recordFcmNoTokens,
  recordFcmNotConfigured,
  recordFcmPushSend,
} from '@/lib/fcmPushTrace'
import type { VoipCallPushPayload } from '@/lib/voipPush'

let firebaseReady = false

export function isFcmPushConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
}

function ensureFirebaseConfigured(): admin.app.App | null {
  if (!isFcmPushConfigured()) return null
  if (firebaseReady && admin.apps.length > 0) return admin.app()

  try {
    if (admin.apps.length === 0) {
      const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      if (inline) {
        const parsed = JSON.parse(inline) as admin.ServiceAccount
        admin.initializeApp({ credential: admin.credential.cert(parsed) })
      } else {
        const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
        if (!path) return null
        const raw = fs.readFileSync(path, 'utf8')
        admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw) as admin.ServiceAccount) })
      }
    }
    firebaseReady = true
    return admin.app()
  } catch (error) {
    console.error('[FCM] Firebase init failed:', error)
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const CANCEL_PUSH_RETRY_GAPS_MS = [400, 600, 1000, 1500, 2500, 3500, 5000, 8000] as const
const CANCEL_PUSH_AWAITED_RETRIES = 4
const RING_PUSH_RETRY_GAPS_MS = [0, 900, 1800, 3500] as const

export function plannedAndroidCancelPushAttempts(): number {
  return 1 + CANCEL_PUSH_RETRY_GAPS_MS.length
}

export interface FcmPushTraceContext {
  callId: string
  fromUserId: string
  ringAttempt?: number
}

async function sendAndroidDataPushToUser(
  userId: string,
  data: Record<string, string>,
  logLabel: string,
  trace?: FcmPushTraceContext,
  payloadType: 'call' | 'cancel' = 'call',
): Promise<void> {
  if (!ensureFirebaseConfigured()) {
    console.warn(`[FCM] skipped (${logLabel}): Firebase not configured`)
    if (trace) {
      await recordFcmNotConfigured({
        callId: trace.callId,
        fromUserId: trace.fromUserId,
        toUserId: userId,
        payloadType,
      }).catch((err) => console.error('[FCM] trace write failed:', err))
    }
    return
  }

  const tokens = await prisma.voipPushToken.findMany({
    where: { userId, platform: 'android' },
  })
  if (tokens.length === 0) {
    console.warn(`[FCM] skipped (${logLabel}): no Android FCM token for user ${userId}`)
    if (trace && payloadType === 'call') {
      await recordFcmNoTokens({
        callId: trace.callId,
        fromUserId: trace.fromUserId,
        toUserId: userId,
      }).catch((err) => console.error('[FCM] trace write failed:', err))
    }
    return
  }

  const staleTokens: string[] = []
  const results: Array<{ ok: boolean; tokenPrefix?: string; error?: string }> = []
  let sent = 0

  await Promise.all(
    tokens.map(async (row) => {
      const tokenPrefix = row.token.slice(0, 12)
      try {
        await admin.messaging().send({
          token: row.token,
          data,
          android: {
            priority: 'high',
            ttl: 45_000,
            directBootOk: true,
          },
        })
        sent += 1
        results.push({ ok: true, tokenPrefix })
        console.info(`[FCM] ${logLabel}: sent to ${tokenPrefix}…`)
      } catch (error) {
        const code = (error as { code?: string }).code
        const message = error instanceof Error ? error.message : String(error)
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          staleTokens.push(row.token)
        } else {
          console.error(`[FCM] ${logLabel} failed for ${tokenPrefix}…:`, error)
        }
        results.push({ ok: false, tokenPrefix, error: code || message })
      }
    }),
  )

  if (sent === 0 && tokens.length > 0) {
    console.warn(`[FCM] ${logLabel}: failed for all ${tokens.length} device(s)`)
  }

  if (trace) {
    await recordFcmPushSend({
      callId: trace.callId,
      fromUserId: trace.fromUserId,
      toUserId: userId,
      payloadType,
      ringAttempt: trace.ringAttempt,
      tokenCount: tokens.length,
      results,
    }).catch((err) => console.error('[FCM] trace write failed:', err))
  }

  if (staleTokens.length > 0) {
    await prisma.voipPushToken.deleteMany({
      where: { token: { in: staleTokens } },
    })
  }
}

/** FCM data push → Android ConnectionService lock-screen incoming call UI. */
export async function sendAndroidCallPushToUser(
  userId: string,
  payload: VoipCallPushPayload,
  trace?: FcmPushTraceContext,
): Promise<void> {
  const callId = normalizeVoiceCallId(payload.callId)
  if (!callId) return

  const declineToken = createVoiceCallDeclineToken(callId)
  const data: Record<string, string> = {
    type: 'call',
    callId,
    handle: payload.handle,
    displayName: payload.displayName,
    handleType: 'generic',
    video: 'false',
    callerId: payload.caller.id,
    callerUsername: payload.caller.username,
    callerName: payload.caller.name ?? '',
  }
  if (declineToken) data.declineToken = declineToken

  await sendAndroidDataPushToUser(
    userId,
    data,
    `incoming call ${callId}`,
    trace ? { ...trace, callId, ringAttempt: trace.ringAttempt ?? 1 } : undefined,
    'call',
  )
}

/** Repeat high-priority FCM call pushes (Android Doze can delay a single data message). */
export async function sendAndroidCallPushBurstToUser(
  userId: string,
  payload: VoipCallPushPayload,
  fromUserId: string,
): Promise<void> {
  const callId = normalizeVoiceCallId(payload.callId)
  if (!callId) return

  for (let i = 0; i < RING_PUSH_RETRY_GAPS_MS.length; i++) {
    const gap = RING_PUSH_RETRY_GAPS_MS[i]!
    if (gap > 0) await sleep(gap)
    try {
      await sendAndroidCallPushToUser(userId, payload, {
        callId,
        fromUserId,
        ringAttempt: i + 1,
      })
    } catch (err) {
      console.error(`[FCM] ring burst #${i + 1} failed for ${callId}:`, err)
    }
  }
}

export async function sendAndroidCallCancelPushToUser(
  userId: string,
  callId: string,
  trace?: FcmPushTraceContext,
): Promise<void> {
  const normalizedCallId = normalizeVoiceCallId(callId)
  if (!normalizedCallId) return
  await sendAndroidDataPushToUser(
    userId,
    { action: 'cancel', callId: normalizedCallId },
    `cancel call ${normalizedCallId}`,
    trace ? { ...trace, callId: normalizedCallId } : undefined,
    'cancel',
  )
}

export async function sendAndroidCallCancelPushBurstToUser(userId: string, callId: string): Promise<void> {
  const normalizedCallId = normalizeVoiceCallId(callId)
  if (!normalizedCallId) return

  let attempt = 0
  const sendOnce = async () => {
    attempt += 1
    await sendAndroidCallCancelPushToUser(userId, normalizedCallId)
  }

  const runRetriesFrom = async (startIndex: number) => {
    for (let i = startIndex; i < CANCEL_PUSH_RETRY_GAPS_MS.length; i++) {
      await sleep(CANCEL_PUSH_RETRY_GAPS_MS[i]!)
      try {
        await sendOnce()
      } catch (err) {
        console.error(`[FCM] cancel retry #${attempt} failed for ${normalizedCallId}:`, err)
      }
    }
  }

  try {
    await sendOnce()
  } catch (err) {
    console.error(`[FCM] cancel #1 failed for ${normalizedCallId}:`, err)
  }

  const awaitedEnd = Math.min(CANCEL_PUSH_AWAITED_RETRIES, CANCEL_PUSH_RETRY_GAPS_MS.length)
  for (let i = 0; i < awaitedEnd; i++) {
    await sleep(CANCEL_PUSH_RETRY_GAPS_MS[i]!)
    try {
      await sendOnce()
    } catch (err) {
      console.error(`[FCM] cancel retry #${attempt} failed for ${normalizedCallId}:`, err)
    }
  }

  if (awaitedEnd < CANCEL_PUSH_RETRY_GAPS_MS.length) {
    void runRetriesFrom(awaitedEnd)
  }
}
