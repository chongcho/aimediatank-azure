import { prisma } from '@/lib/prisma'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'

export const FCM_CALL_RING_TYPE = 'fcm_call_ring'
export const FCM_CALL_CANCEL_TYPE = 'fcm_call_cancel'
export const FCM_NOT_CONFIGURED_TYPE = 'fcm_not_configured'
export const FCM_NO_TOKENS_TYPE = 'fcm_no_tokens'

export async function recordFcmPushSend(params: {
  callId: string
  toUserId: string
  fromUserId: string
  payloadType: 'call' | 'cancel'
  ringAttempt?: number
  tokenCount: number
  results: Array<{
    ok: boolean
    tokenPrefix?: string
    error?: string
  }>
}): Promise<void> {
  const callId = normalizeVoiceCallId(params.callId)
  if (!callId) return

  const type = params.payloadType === 'cancel' ? FCM_CALL_CANCEL_TYPE : FCM_CALL_RING_TYPE

  await prisma.voiceCallSignal.create({
    data: {
      callId,
      fromUserId: params.fromUserId,
      toUserId: params.toUserId,
      type,
      payload: JSON.stringify({
        ringAttempt: params.ringAttempt ?? 1,
        tokenCount: params.tokenCount,
        results: params.results,
        at: new Date().toISOString(),
      }),
    },
  })
}

export async function recordFcmNotConfigured(params: {
  callId: string
  toUserId: string
  fromUserId: string
  payloadType: 'call' | 'cancel'
}): Promise<void> {
  const callId = normalizeVoiceCallId(params.callId)
  if (!callId) return

  await prisma.voiceCallSignal.create({
    data: {
      callId,
      fromUserId: params.fromUserId,
      toUserId: params.toUserId,
      type: FCM_NOT_CONFIGURED_TYPE,
      payload: JSON.stringify({
        payloadType: params.payloadType,
        hint: 'Set FIREBASE_SERVICE_ACCOUNT_JSON on Azure (aimediatank-azure)',
        at: new Date().toISOString(),
      }),
    },
  })
}

export async function recordFcmNoTokens(params: {
  callId: string
  toUserId: string
  fromUserId: string
}): Promise<void> {
  const callId = normalizeVoiceCallId(params.callId)
  if (!callId) return

  await prisma.voiceCallSignal.create({
    data: {
      callId,
      fromUserId: params.fromUserId,
      toUserId: params.toUserId,
      type: FCM_NO_TOKENS_TYPE,
      payload: JSON.stringify({
        hint: 'Install Play internal app, sign in, allow notifications',
        at: new Date().toISOString(),
      }),
    },
  })
}
