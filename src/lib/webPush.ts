import webpush from 'web-push'
import { prisma } from '@/lib/prisma'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'
import {
  endpointKind,
  recordWebPushNoSubscriptions,
  recordWebPushSend,
} from '@/lib/webPushTrace'

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
  /** Server-side ring retry counter (lock-screen re-alert on Android). */
  ringAttempt?: number
}

export interface VoiceCallDismissPushPayload {
  type: 'voice_call_dismiss'
  callId: string
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Gaps between ring Web Push retries (ms). Doze can delay the first delivery; repeats wake/vibrate. */
const RING_PUSH_RETRY_GAPS_MS = [1500, 3000, 6000, 12000, 20000, 30000] as const

const RING_PUSH_AWAITED_RETRIES = 3

function voiceCallPushTopic(callId: string): string {
  const id = normalizeVoiceCallId(callId) || callId
  return id.length <= 32 ? id : id.slice(0, 32)
}

async function isCallStillRinging(callId: string): Promise<boolean> {
  const id = normalizeVoiceCallId(callId)
  if (!id) return false
  const call = await prisma.voiceCall.findUnique({
    where: { id },
    select: { status: true },
  })
  return call?.status === 'ringing'
}

export interface VoiceCallPushTraceContext {
  callId: string
  fromUserId: string
  ringAttempt?: number
}

export async function sendVoiceCallPushToUser(
  userId: string,
  payload: VoiceCallPushPayload | VoiceCallDismissPushPayload,
  trace?: VoiceCallPushTraceContext,
): Promise<void> {
  if (!isWebPushConfigured()) {
    console.warn('[WebPush] VAPID not configured — push skipped')
    return
  }

  ensureVapidConfigured()

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  })

  const callId = normalizeVoiceCallId(payload.callId)
  const ringAttempt = trace?.ringAttempt ?? ('ringAttempt' in payload ? payload.ringAttempt : undefined)

  if (subscriptions.length === 0) {
    console.warn(`[WebPush] no push subscriptions for user ${userId} call=${callId ?? '?'}`)
    if (trace && callId) {
      await recordWebPushNoSubscriptions({
        callId,
        toUserId: userId,
        fromUserId: trace.fromUserId,
        ringAttempt,
      })
    }
    return
  }

  const body = JSON.stringify(payload)
  const staleEndpoints: string[] = []
  const topic = callId ? voiceCallPushTopic(callId) : 'aimediatank'
  const results: Array<{
    endpointKind: string
    ok: boolean
    statusCode?: number
    error?: string
  }> = []

  await Promise.all(
    subscriptions.map(async (sub) => {
      const kind = endpointKind(sub.endpoint)
      try {
        const res = await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          {
            TTL: payload.type === 'voice_call' ? 45 : 30,
            urgency: 'high',
            topic,
          },
        )
        results.push({ endpointKind: kind, ok: true, statusCode: res.statusCode })
        console.info(
          `[WebPush] sent ${payload.type} call=${callId} user=${userId} attempt=${ringAttempt ?? 1} ${kind} status=${res.statusCode}`,
        )
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        const message = (error as { body?: string }).body || String(error)
        results.push({ endpointKind: kind, ok: false, statusCode: status, error: message.slice(0, 200) })
        if (status === 404 || status === 410) {
          staleEndpoints.push(sub.endpoint)
        } else {
          console.error(`[WebPush] send failed call=${callId} ${kind} (${status ?? 'unknown'}):`, error)
        }
      }
    }),
  )

  if (trace && callId) {
    await recordWebPushSend({
      callId,
      toUserId: userId,
      fromUserId: trace.fromUserId,
      payloadType: payload.type,
      ringAttempt,
      subscriptionCount: subscriptions.length,
      results,
    })
  }

  if (staleEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: staleEndpoints } },
    })
  }
}

/** Clear lock-screen incoming call notification on callee device. */
export async function sendVoiceCallDismissPushToUser(
  userId: string,
  callId: string,
  fromUserId: string,
): Promise<void> {
  const normalizedCallId = normalizeVoiceCallId(callId)
  if (!normalizedCallId) return
  await sendVoiceCallPushToUser(
    userId,
    {
      type: 'voice_call_dismiss',
      callId: normalizedCallId,
    },
    { callId: normalizedCallId, fromUserId },
  )
}

/**
 * Send ring Web Push repeatedly while the call is still ringing. Improves Android lock-screen
 * wake/vibrate when Doze delays the first push.
 */
export async function sendVoiceCallRingPushBurstToUser(
  userId: string,
  payload: VoiceCallPushPayload,
): Promise<void> {
  const callId = normalizeVoiceCallId(payload.callId)
  if (!callId) return

  let attempt = 0

  const sendOnce = async () => {
    attempt += 1
    if (!(await isCallStillRinging(callId))) return
    await sendVoiceCallPushToUser(
      userId,
      {
        ...payload,
        callId,
        ringAttempt: attempt,
      },
      { callId, fromUserId: payload.caller.id, ringAttempt: attempt },
    )
  }

  const runRetriesFrom = async (startIndex: number) => {
    for (let i = startIndex; i < RING_PUSH_RETRY_GAPS_MS.length; i++) {
      await sleep(RING_PUSH_RETRY_GAPS_MS[i]!)
      try {
        await sendOnce()
      } catch (err) {
        console.error(`[WebPush] ring push retry #${attempt} failed for ${callId}:`, err)
      }
    }
  }

  try {
    await sendOnce()
  } catch (err) {
    console.error(`[WebPush] ring push #1 failed for ${callId}:`, err)
  }

  const awaitedEnd = Math.min(RING_PUSH_AWAITED_RETRIES, RING_PUSH_RETRY_GAPS_MS.length)
  for (let i = 0; i < awaitedEnd; i++) {
    await sleep(RING_PUSH_RETRY_GAPS_MS[i]!)
    try {
      await sendOnce()
    } catch (err) {
      console.error(`[WebPush] ring push retry #${attempt} failed for ${callId}:`, err)
    }
  }

  if (awaitedEnd < RING_PUSH_RETRY_GAPS_MS.length) {
    void runRetriesFrom(awaitedEnd)
  }
}
