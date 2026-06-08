import { prisma } from '@/lib/prisma'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'

export const VOIP_CANCEL_BURST_TYPE = 'voip_cancel_burst'
export const NATIVE_CANCEL_ACK_TYPE = 'native_cancel_ack'

export async function recordVoipCancelBurst(params: {
  callId: string
  fromUserId: string
  toUserId: string
  plannedAttempts: number
}): Promise<void> {
  const callId = normalizeVoiceCallId(params.callId)
  if (!callId) return
  await prisma.voiceCallSignal.create({
    data: {
      callId,
      fromUserId: params.fromUserId,
      toUserId: params.toUserId,
      type: VOIP_CANCEL_BURST_TYPE,
      payload: JSON.stringify({
        plannedAttempts: params.plannedAttempts,
        at: new Date().toISOString(),
      }),
    },
  })
}

export async function recordNativeCancelAck(params: {
  callId: string
  source: string
  hasDeclineToken: boolean
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
      type: NATIVE_CANCEL_ACK_TYPE,
      payload: JSON.stringify({
        source: params.source,
        hasDeclineToken: params.hasDeclineToken,
        at: new Date().toISOString(),
      }),
    },
  })
}

export async function getVoipCallTrace(callId: string) {
  const normalized = normalizeVoiceCallId(callId)
  if (!normalized) return null

  const call = await prisma.voiceCall.findUnique({
    where: { id: normalized },
    select: { status: true, createdAt: true, endedAt: true },
  })
  if (!call) return null

  const signals = await prisma.voiceCallSignal.findMany({
    where: {
      callId: normalized,
      type: { in: [VOIP_CANCEL_BURST_TYPE, NATIVE_CANCEL_ACK_TYPE] },
    },
    orderBy: { createdAt: 'asc' },
    select: { type: true, payload: true, createdAt: true },
  })

  const cancelBurst = signals
    .filter((s) => s.type === VOIP_CANCEL_BURST_TYPE)
    .map((s) => ({ ...JSON.parse(s.payload), recordedAt: s.createdAt }))

  const deviceAcks = signals
    .filter((s) => s.type === NATIVE_CANCEL_ACK_TYPE)
    .map((s) => ({ ...JSON.parse(s.payload), recordedAt: s.createdAt }))

  return {
    callId: normalized,
    callStatus: call.status,
    callCreatedAt: call.createdAt,
    callEndedAt: call.endedAt,
    cancelBurst,
    deviceAcks,
    cancelReceivedOnDevice: deviceAcks.length > 0,
    cancelReceivedViaVoipPush: deviceAcks.some((a) => a.source === 'voip_cancel_push'),
    cancelReceivedViaStatusPoll: deviceAcks.some((a) => a.source === 'status_poll'),
  }
}
