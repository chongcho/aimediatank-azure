import {
  sendAndroidCallCancelPushBurstToUser,
  sendAndroidCallPushBurstToUser,
} from '@/lib/fcmPush'
import {
  sendVoipCallCancelPushBurstToUser,
  sendVoipCallPushToUser,
  type VoipCallPushPayload,
} from '@/lib/voipPush'

/** PushKit (iOS) + FCM data (Android) for lock-screen incoming calls. */
export async function sendNativeCallPushToUser(
  userId: string,
  payload: VoipCallPushPayload,
  fromUserId?: string,
): Promise<void> {
  await Promise.all([
    sendVoipCallPushToUser(userId, payload).catch((err) =>
      console.error('[NativeCall] iOS VoIP push failed:', err),
    ),
    sendAndroidCallPushBurstToUser(userId, payload, fromUserId || payload.caller.id).catch((err) =>
      console.error('[NativeCall] Android FCM push failed:', err),
    ),
  ])
}

export async function sendNativeCallCancelPushBurstToUser(userId: string, callId: string): Promise<void> {
  await Promise.all([
    sendVoipCallCancelPushBurstToUser(userId, callId).catch((err) =>
      console.error('[NativeCall] iOS cancel push failed:', err),
    ),
    sendAndroidCallCancelPushBurstToUser(userId, callId).catch((err) =>
      console.error('[NativeCall] Android cancel push failed:', err),
    ),
  ])
}
