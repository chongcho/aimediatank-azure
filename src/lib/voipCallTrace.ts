import { prisma } from '@/lib/prisma'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'

export const VOIP_CANCEL_BURST_TYPE = 'voip_cancel_burst'
export const NATIVE_CANCEL_ACK_TYPE = 'native_cancel_ack'
export const NATIVE_IOS_TRACE_TYPE = 'native_ios_trace'

const NATIVE_TRACE_SIGNAL_TYPES = [
  VOIP_CANCEL_BURST_TYPE,
  NATIVE_CANCEL_ACK_TYPE,
  NATIVE_IOS_TRACE_TYPE,
] as const

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

/** True once the iPhone reported it processed a cancel (stop further cancel VoIP bursts). */
export async function voiceCallHasNativeCancelAck(callId: string): Promise<boolean> {
  const normalized = normalizeVoiceCallId(callId)
  if (!normalized) return false
  const row = await prisma.voiceCallSignal.findFirst({
    where: { callId: normalized, type: NATIVE_CANCEL_ACK_TYPE },
    select: { id: true },
  })
  return Boolean(row)
}

export async function recordNativeIosTrace(params: {
  callId: string
  event: string
  source?: string
  detail?: Record<string, unknown>
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
      type: NATIVE_IOS_TRACE_TYPE,
      payload: JSON.stringify({
        event: params.event,
        source: params.source ?? 'ios_bridge',
        detail: params.detail ?? null,
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
      type: { in: [...NATIVE_TRACE_SIGNAL_TYPES] },
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

  const nativeIos = signals
    .filter((s) => s.type === NATIVE_IOS_TRACE_TYPE)
    .map((s) => ({ ...JSON.parse(s.payload), recordedAt: s.createdAt }))

  return {
    callId: normalized,
    callStatus: call.status,
    callCreatedAt: call.createdAt,
    callEndedAt: call.endedAt,
    cancelBurst,
    deviceAcks,
    nativeIos,
    cancelReceivedOnDevice: deviceAcks.length > 0,
    cancelReceivedViaVoipPush: deviceAcks.some((a) => a.source === 'voip_cancel_push'),
    cancelReceivedViaStatusPoll: deviceAcks.some((a) => a.source === 'status_poll'),
    voipPushReceivedOnDevice: nativeIos.some((e) => e.event === 'voip_push_received'),
    callkitReportedOnDevice: nativeIos.some((e) => e.event === 'callkit_report_ok'),
    callkitAnsweredOnDevice: nativeIos.some((e) => e.event === 'callkit_answer'),
  }
}

export async function formatCalleeIosTokenSummary(userId: string): Promise<string> {
  const tokens = await prisma.voipPushToken.findMany({
    where: { userId, platform: 'ios' },
    orderBy: { updatedAt: 'desc' },
    select: { token: true, updatedAt: true },
  })
  if (tokens.length === 0) return 'none'
  return tokens
    .map((row) => {
      const ageHours = Math.round((Date.now() - row.updatedAt.getTime()) / 3_600_000)
      return `${row.token.slice(0, 8)}:${ageHours}h`
    })
    .join(',')
}

/** Grep-friendly single-line P3-P6 summary for Azure log diagnosis. */
export async function logVoipPipelineSummary(callId: string, reason: string): Promise<void> {
  const normalized = normalizeVoiceCallId(callId)
  if (!normalized) return

  const call = await prisma.voiceCall.findUnique({
    where: { id: normalized },
    select: { calleeId: true, status: true },
  })
  if (!call) return

  const trace = await getVoipCallTrace(normalized)
  const tokenSummary = await formatCalleeIosTokenSummary(call.calleeId)
  const events =
    trace?.nativeIos.map((e) => (typeof e.event === 'string' ? e.event : 'unknown')).join(',') || 'none'

  const p3 = 'sent'
  const p4 = trace?.voipPushReceivedOnDevice ? 'ok' : 'fail'
  const p5 = trace?.callkitReportedOnDevice
    ? 'ok'
    : trace?.voipPushReceivedOnDevice
      ? 'fail'
      : 'skip'
  const p6 = trace?.callkitAnsweredOnDevice ? 'ok' : 'skip'
  const cancelAck = trace?.cancelReceivedOnDevice ? 'yes' : 'no'

  console.info(
    `[VoIP] pipeline call=${normalized} reason=${reason} status=${call.status} P3=${p3} P4=${p4} P5=${p5} P6=${p6} token=${tokenSummary} cancelAck=${cancelAck} events=${events}`,
  )
}
