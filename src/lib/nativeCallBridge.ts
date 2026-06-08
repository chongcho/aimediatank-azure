'use client'

import { Capacitor } from '@capacitor/core'
import { detectNativeShell, getNativePlatform } from '@/lib/nativeShellBoot'

export interface NativeIncomingCallPayload {
  callId: string
  displayName: string
  handle: string
  handleType?: string
  video?: boolean
  metadata?: {
    callerId?: string
    callerUsername?: string
    callerName?: string | null
    callerAvatar?: string | null
  }
}

export interface NativeCallBridgeHandlers {
  onIncomingCall: (call: NativeIncomingCallPayload) => void
  onCallAnswered: (callId: string) => void
  onCallRejected: (callId: string) => void
  onCallEnded: (callId: string) => void
}

let bridgeInitialized = false
let voipBootstrapped = false
let voipListenerAttached = false
let bridgeHandlers: NativeCallBridgeHandlers | null = null
let pendingVoipToken: string | null = null

export function isNativeCallApp(): boolean {
  if (typeof window === 'undefined') return false
  return Capacitor.isNativePlatform() || detectNativeShell()
}

export function isNativeIosCallApp(): boolean {
  return isNativeCallApp() && getNativePlatform() === 'ios'
}

async function subscribeVoipToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/push/voip-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: 'ios' }),
      credentials: 'include',
    })
    if (res.status === 401) {
      pendingVoipToken = token
      console.warn('[VoIP] token received but user not signed in yet')
      return false
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('[VoIP] token registration failed:', res.status, body)
      return false
    }
    pendingVoipToken = null
    console.info('[VoIP] device token saved for signed-in user')
    return true
  } catch (error) {
    console.error('[VoIP] token registration failed:', error)
    return false
  }
}

function attachVoipTokenListener(
  CapacitorPushCalls: Awaited<
    typeof import('@kapsula-chat/capacitor-push-calls')
  >['CapacitorPushCalls'],
): void {
  if (voipListenerAttached) return
  CapacitorPushCalls.addListener('voipPushToken', ({ token }) => {
    if (!token) return
    console.info('[VoIP] PushKit token received')
    void subscribeVoipToken(token)
  })
  voipListenerAttached = true
}

/** Register PushKit early so VoIP pushes wake the app on lock screen. */
export async function bootstrapNativeVoip(): Promise<boolean> {
  if (!isNativeIosCallApp() || voipBootstrapped) return voipBootstrapped

  try {
    const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')

    // Listener must be attached before registerVoipNotifications or the token can be missed.
    attachVoipTokenListener(CapacitorPushCalls)

    try {
      const permissions = await CapacitorPushCalls.checkPermissions()
      if (permissions.receive !== 'granted') {
        await CapacitorPushCalls.requestPermissions()
      }
    } catch {
      // user may grant later
    }

    await CapacitorPushCalls.registerVoipNotifications()
    voipBootstrapped = true
    console.info('[VoIP] PushKit registration started')
    return true
  } catch (error) {
    console.error('[VoIP] bootstrap failed (native plugin unavailable?):', error)
    return false
  }
}

/** After sign-in, attach the VoIP device token to the current user. */
export async function subscribeNativeVoipIfNeeded(): Promise<void> {
  if (!isNativeIosCallApp()) return
  await bootstrapNativeVoip()
  if (pendingVoipToken) {
    await subscribeVoipToken(pendingVoipToken)
  }
}

/** Show CallKit incoming UI with native ringtone (lock screen / sleep). */
export async function reportIncomingCallToCallKit(params: {
  callId: string
  handle: string
  displayName: string
  caller?: {
    id: string
    username: string
    name: string | null
    avatar: string | null
  }
}): Promise<void> {
  if (!isNativeIosCallApp()) return

  const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
  await CapacitorPushCalls.handleIncomingCall({
    callId: params.callId,
    handle: params.handle,
    displayName: params.displayName,
    handleType: 'generic',
    video: false,
    metadata: params.caller
      ? {
          callerId: params.caller.id,
          callerUsername: params.caller.username,
          callerName: params.caller.name,
          callerAvatar: params.caller.avatar,
        }
      : undefined,
  })
}

/** Register PushKit + CallKit listeners (native iOS app only). */
export async function initNativeCallBridge(handlers: NativeCallBridgeHandlers): Promise<boolean> {
  if (!isNativeIosCallApp()) return false
  if (bridgeInitialized && bridgeHandlers === handlers) return true

  bridgeHandlers = handlers
  await bootstrapNativeVoip()
  await subscribeNativeVoipIfNeeded()

  const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')

  if (!bridgeInitialized) {
    CapacitorPushCalls.addListener('incomingCall', (call) => {
      bridgeHandlers?.onIncomingCall(call as NativeIncomingCallPayload)
    })

    CapacitorPushCalls.addListener('callAnswered', ({ callId }) => {
      if (callId) bridgeHandlers?.onCallAnswered(callId)
    })

    CapacitorPushCalls.addListener('callRejected', ({ callId }) => {
      if (callId) bridgeHandlers?.onCallRejected(callId)
    })

    CapacitorPushCalls.addListener('callEnded', ({ callId }) => {
      if (callId) bridgeHandlers?.onCallEnded(callId)
    })

    bridgeInitialized = true
  }

  return true
}

/** Answer via CallKit (triggers callAnswered → WebRTC in useVoiceCall). */
export async function answerNativeCall(callId: string | null | undefined): Promise<boolean> {
  if (!isNativeIosCallApp() || !callId) return false
  try {
    const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
    await CapacitorPushCalls.answerCall({ callId })
    return true
  } catch (error) {
    console.error('[VoIP] native CallKit answer failed:', error)
    return false
  }
}

/** Tell CallKit the native call UI can end (after WebRTC hangup). */
export async function endNativeCall(callId: string | null | undefined): Promise<void> {
  if (!isNativeIosCallApp() || !callId) return
  try {
    const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
    await CapacitorPushCalls.endCall({ callId })
  } catch {
    // ignore when CallKit already dismissed the call
  }
}
