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
let nativePushBootstrapped = false
let pushListenerAttached = false
let bridgeHandlers: NativeCallBridgeHandlers | null = null
let pendingNativeToken: string | null = null
let pendingNativePlatform: 'ios' | 'android' | null = null

export function isNativeCallApp(): boolean {
  if (typeof window === 'undefined') return false
  return Capacitor.isNativePlatform() || detectNativeShell()
}

export function isNativeIosCallApp(): boolean {
  return isNativeCallApp() && getNativePlatform() === 'ios'
}

export function isNativeAndroidCallApp(): boolean {
  return isNativeCallApp() && getNativePlatform() === 'android'
}

/** Native TestFlight / Play app with lock-screen call UI (iOS CallKit or Android ConnectionService). */
export function isNativeVoiceCallApp(): boolean {
  return isNativeIosCallApp() || isNativeAndroidCallApp()
}

async function subscribeNativePushToken(token: string, platform: 'ios' | 'android'): Promise<boolean> {
  try {
    const res = await fetch('/api/push/voip-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform }),
      credentials: 'include',
    })
    if (res.status === 401) {
      pendingNativeToken = token
      pendingNativePlatform = platform
      console.warn(`[NativePush] ${platform} token received but user not signed in yet`)
      return false
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error(`[NativePush] ${platform} token registration failed:`, res.status, body)
      return false
    }
    pendingNativeToken = null
    pendingNativePlatform = null
    console.info(`[NativePush] ${platform} device token saved for signed-in user`)
    return true
  } catch (error) {
    console.error(`[NativePush] ${platform} token registration failed:`, error)
    return false
  }
}

function attachNativePushListeners(
  CapacitorPushCalls: Awaited<
    typeof import('@kapsula-chat/capacitor-push-calls')
  >['CapacitorPushCalls'],
): void {
  if (pushListenerAttached) return

  CapacitorPushCalls.addListener('voipPushToken', ({ token }) => {
    if (!token) return
    console.info('[NativePush] PushKit token received')
    void subscribeNativePushToken(token, 'ios')
  })

  CapacitorPushCalls.addListener('registration', ({ value }) => {
    if (!value) return
    if (isNativeAndroidCallApp()) {
      console.info('[NativePush] FCM registration token received')
      void subscribeNativePushToken(value, 'android')
    }
  })

  pushListenerAttached = true
}

async function ensurePushPermissions(
  CapacitorPushCalls: Awaited<
    typeof import('@kapsula-chat/capacitor-push-calls')
  >['CapacitorPushCalls'],
): Promise<void> {
  try {
    const permissions = await CapacitorPushCalls.checkPermissions()
    if (permissions.receive !== 'granted') {
      await CapacitorPushCalls.requestPermissions()
    }
  } catch {
    // user may grant later
  }
}

/** Register PushKit (iOS) or FCM (Android) early so lock-screen pushes wake the app. */
export async function bootstrapNativePush(): Promise<boolean> {
  if (!isNativeVoiceCallApp() || nativePushBootstrapped) return nativePushBootstrapped

  try {
    const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
    attachNativePushListeners(CapacitorPushCalls)
    await ensurePushPermissions(CapacitorPushCalls)

    if (isNativeIosCallApp()) {
      await CapacitorPushCalls.registerVoipNotifications()
      console.info('[NativePush] PushKit registration started')
    } else if (isNativeAndroidCallApp()) {
      await CapacitorPushCalls.register()
      console.info('[NativePush] FCM registration started')
    }

    nativePushBootstrapped = true
    return true
  } catch (error) {
    console.error('[NativePush] bootstrap failed (native plugin unavailable?):', error)
    return false
  }
}

/** @deprecated Use bootstrapNativePush */
export const bootstrapNativeVoip = bootstrapNativePush

/** After sign-in, attach the native push token to the current user. */
export async function subscribeNativePushIfNeeded(): Promise<void> {
  if (!isNativeVoiceCallApp()) return
  await bootstrapNativePush()
  if (pendingNativeToken && pendingNativePlatform) {
    await subscribeNativePushToken(pendingNativeToken, pendingNativePlatform)
  }
}

/** @deprecated Use subscribeNativePushIfNeeded */
export const subscribeNativeVoipIfNeeded = subscribeNativePushIfNeeded

/**
 * Show native incoming call UI from JS (foreground fallback).
 * Lock screen uses server push → CallKit / ConnectionService; skip duplicate report there.
 */
export async function reportIncomingCallToNativeUi(params: {
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
  if (!isNativeVoiceCallApp()) return

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

/** @deprecated Use reportIncomingCallToNativeUi */
export const reportIncomingCallToCallKit = reportIncomingCallToNativeUi

/** Register native push + call event listeners (iOS CallKit / Android ConnectionService). */
export async function initNativeCallBridge(handlers: NativeCallBridgeHandlers): Promise<boolean> {
  if (!isNativeVoiceCallApp()) return false
  if (bridgeInitialized && bridgeHandlers === handlers) return true

  bridgeHandlers = handlers
  await bootstrapNativePush()
  await subscribeNativePushIfNeeded()

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

export async function answerNativeCall(callId: string | null | undefined): Promise<boolean> {
  if (!isNativeVoiceCallApp() || !callId) return false
  try {
    const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
    await CapacitorPushCalls.answerCall({ callId })
    return true
  } catch (error) {
    console.error('[NativeCall] native answer failed:', error)
    return false
  }
}

export async function markNativeCallConnected(callId: string | null | undefined): Promise<void> {
  if (!isNativeVoiceCallApp() || !callId) return
  try {
    const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
    await CapacitorPushCalls.updateCallStatus({ callId, status: 'connected' })
  } catch {
    // ignore when native UI already shows connected
  }
}

export async function endNativeCall(callId: string | null | undefined): Promise<void> {
  if (!isNativeVoiceCallApp() || !callId) return
  try {
    const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
    await CapacitorPushCalls.endCall({ callId })
  } catch {
    // ignore when native UI already dismissed the call
  }
}
