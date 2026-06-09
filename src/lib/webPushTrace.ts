import { prisma } from '@/lib/prisma'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'

export const WEB_PUSH_RING_TYPE = 'web_push_ring'
export const WEB_PUSH_DISMISS_TYPE = 'web_push_dismiss'
export const WEB_PUSH_DEVICE_ACK_TYPE = 'web_push_device_ack'
export const WEB_PUSH_NO_SUBS_TYPE = 'web_push_no_subscriptions'

const WEB_PUSH_SIGNAL_TYPES = [
  WEB_PUSH_RING_TYPE,
  WEB_PUSH_DISMISS_TYPE,
  WEB_PUSH_DEVICE_ACK_TYPE,
  WEB_PUSH_NO_SUBS_TYPE,
] as const

export function endpointKind(endpoint: string): string {
  if (endpoint.includes('fcm.googleapis.com')) return 'FCM/Android'
  if (endpoint.includes('updates.push.services.mozilla.com')) return 'Mozilla'
  if (endpoint.includes('web.push.apple.com')) return 'Apple'
  return 'other'
}

export async function recordWebPushSend(params: {
  callId: string
  toUserId: string
  fromUserId: string
  payloadType: 'voice_call' | 'voice_call_dismiss'
  ringAttempt?: number
  subscriptionCount: number
  results: Array<{
    endpointKind: string
    ok: boolean
    statusCode?: number
    error?: string
  }>
}): Promise<void> {
  const callId = normalizeVoiceCallId(params.callId)
  if (!callId) return

  const type =
    params.payloadType === 'voice_call_dismiss' ? WEB_PUSH_DISMISS_TYPE : WEB_PUSH_RING_TYPE

  await prisma.voiceCallSignal.create({
    data: {
      callId,
      fromUserId: params.fromUserId,
      toUserId: params.toUserId,
      type,
      payload: JSON.stringify({
        ringAttempt: params.ringAttempt ?? 1,
        subscriptionCount: params.subscriptionCount,
        results: params.results,
        at: new Date().toISOString(),
      }),
    },
  })
}

export async function recordWebPushNoSubscriptions(params: {
  callId: string
  toUserId: string
  fromUserId: string
  ringAttempt?: number
}): Promise<void> {
  const callId = normalizeVoiceCallId(params.callId)
  if (!callId) return

  await prisma.voiceCallSignal.create({
    data: {
      callId,
      fromUserId: params.fromUserId,
      toUserId: params.toUserId,
      type: WEB_PUSH_NO_SUBS_TYPE,
      payload: JSON.stringify({
        ringAttempt: params.ringAttempt ?? 1,
        at: new Date().toISOString(),
      }),
    },
  })
}

export async function recordWebPushDeviceAck(params: {
  callId: string
  event: string
  detail?: string
}): Promise<void> {
  const callId = normalizeVoiceCallId(params.callId)
  if (!callId) return

  const call = await prisma.voiceCall.findUnique({
    where: { id: callId },
    select: { callerId: true, calleeId: true },
  })
  if (!call) return

  await prisma.voiceCallSignal.create({
    data: {
      callId,
      fromUserId: call.calleeId,
      toUserId: call.callerId,
      type: WEB_PUSH_DEVICE_ACK_TYPE,
      payload: JSON.stringify({
        event: params.event,
        detail: params.detail ?? null,
        at: new Date().toISOString(),
      }),
    },
  })
}

export async function getWebPushTrace(callId: string) {
  const normalized = normalizeVoiceCallId(callId)
  if (!normalized) return null

  const call = await prisma.voiceCall.findUnique({
    where: { id: normalized },
    select: {
      status: true,
      createdAt: true,
      endedAt: true,
      caller: { select: { username: true, name: true } },
      callee: { select: { username: true, name: true } },
    },
  })
  if (!call) return null

  const signals = await prisma.voiceCallSignal.findMany({
    where: {
      callId: normalized,
      type: { in: [...WEB_PUSH_SIGNAL_TYPES] },
    },
    orderBy: { createdAt: 'asc' },
    select: { type: true, payload: true, createdAt: true },
  })

  const ringSends = signals
    .filter((s) => s.type === WEB_PUSH_RING_TYPE)
    .map((s) => ({ ...JSON.parse(s.payload), recordedAt: s.createdAt }))

  const dismissSends = signals
    .filter((s) => s.type === WEB_PUSH_DISMISS_TYPE)
    .map((s) => ({ ...JSON.parse(s.payload), recordedAt: s.createdAt }))

  const noSubs = signals
    .filter((s) => s.type === WEB_PUSH_NO_SUBS_TYPE)
    .map((s) => ({ ...JSON.parse(s.payload), recordedAt: s.createdAt }))

  const deviceAcks = signals
    .filter((s) => s.type === WEB_PUSH_DEVICE_ACK_TYPE)
    .map((s) => ({ ...JSON.parse(s.payload), recordedAt: s.createdAt }))

  const fcmAccepted = ringSends.some((r) =>
    (r.results as Array<{ ok: boolean }> | undefined)?.some((x) => x.ok),
  )
  const deviceReceived = deviceAcks.some((a) => a.event === 'push_received')
  const deviceShowed = deviceAcks.some((a) => a.event === 'notification_shown')

  return {
    callId: normalized,
    caller: call.caller,
    callee: call.callee,
    callStatus: call.status,
    callCreatedAt: call.createdAt,
    callEndedAt: call.endedAt,
    ringSends,
    dismissSends,
    noSubscriptions: noSubs,
    deviceAcks,
    summary: {
      ringPushAttempts: ringSends.length,
      fcmAccepted,
      devicePushReceived: deviceReceived,
      deviceNotificationShown: deviceShowed,
      likelyIssue: !fcmAccepted
        ? 'no_fcm_accept'
        : !deviceReceived
          ? 'fcm_ok_but_sw_never_received'
          : !deviceShowed
            ? 'sw_received_but_notification_failed'
            : 'notification_shown_check_android_settings',
    },
  }
}
