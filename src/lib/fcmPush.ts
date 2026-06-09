import fs from 'fs'
import admin from 'firebase-admin'
import { prisma } from '@/lib/prisma'
import { createVoiceCallDeclineToken } from '@/lib/voiceCallDeclineToken'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'
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

export function plannedAndroidCancelPushAttempts(): number {
  return 1 + CANCEL_PUSH_RETRY_GAPS_MS.length
}

async function sendAndroidDataPushToUser(
  userId: string,
  data: Record<string, string>,
  logLabel: string,
): Promise<void> {
  const app = ensureFirebaseConfigured()
  if (!app) {
    console.warn(`[FCM] skipped (${logLabel}): Firebase not configured`)
    return
  }

  const tokens = await prisma.voipPushToken.findMany({
    where: { userId, platform: 'android' },
  })
  if (tokens.length === 0) {
    console.warn(`[FCM] skipped (${logLabel}): no Android FCM token for user ${userId}`)
    return
  }

  const staleTokens: string[] = []
  let sent = 0

  await Promise.all(
    tokens.map(async (row) => {
      try {
        await admin.messaging().send({
          token: row.token,
          data,
          android: {
            priority: 'high',
            ttl: 45_000,
          },
        })
        sent += 1
        console.info(`[FCM] ${logLabel}: sent to ${row.token.slice(0, 12)}…`)
      } catch (error) {
        const code = (error as { code?: string }).code
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          staleTokens.push(row.token)
        } else {
          console.error(`[FCM] ${logLabel} failed for ${row.token.slice(0, 12)}…:`, error)
        }
      }
    }),
  )

  if (sent === 0 && tokens.length > 0) {
    console.warn(`[FCM] ${logLabel}: failed for all ${tokens.length} device(s)`)
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

  await sendAndroidDataPushToUser(userId, data, `incoming call ${callId}`)
}

export async function sendAndroidCallCancelPushToUser(userId: string, callId: string): Promise<void> {
  const normalizedCallId = normalizeVoiceCallId(callId)
  if (!normalizedCallId) return
  await sendAndroidDataPushToUser(
    userId,
    { action: 'cancel', callId: normalizedCallId },
    `cancel call ${normalizedCallId}`,
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
