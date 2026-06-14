'use client'

import { Capacitor } from '@capacitor/core'
import { detectNativeShell, getNativePlatform } from '@/lib/nativeShellBoot'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'

export interface NativeIncomingCallPayload {
  callId: string
  displayName: string
  handle: string
  handleType?: string
  video?: boolean
  declineToken?: string
  metadata?: {
    callerId?: string
    callerUsername?: string
    callerName?: string | null
    callerAvatar?: string | null
    declineToken?: string
  }
}

const declineTokenByCallId = new Map<string, string>()

export function cacheNativeDeclineToken(callId: string, token?: string | null): void {
  const normalized = normalizeVoiceCallId(callId)
  const trimmed = (token || '').trim()
  if (normalized && trimmed) {
    declineTokenByCallId.set(normalized, trimmed)
  }
}

export function getCachedNativeDeclineToken(callId: string): string | undefined {
  return declineTokenByCallId.get(normalizeVoiceCallId(callId))
}

function declineTokenFromIncoming(call: NativeIncomingCallPayload): string | undefined {
  const direct = (call.declineToken || '').trim()
  if (direct) return direct
  const meta = (call.metadata?.declineToken || '').trim()
  return meta || undefined
}

export interface NativeCallBridgeHandlers {
  onIncomingCall: (call: NativeIncomingCallPayload) => void
  onCallAnswered: (callId: string, declineToken?: string) => void
  onCallRejected: (callId: string) => void
  onCallEnded: (callId: string) => void
}

let bridgeInitialized = false
let callListenersAttached = false
let nativePushBootstrapped = false
let pushListenerAttached = false
let bridgeHandlers: NativeCallBridgeHandlers | null = null
let pendingNativeToken: string | null = null
let pendingNativePlatform: 'ios' | 'android' | null = null
let pendingIncomingCall: NativeIncomingCallPayload | null = null
let pendingCallAnswered: { callId: string; declineToken?: string } | null = null
let pendingCallRejected: string | null = null
let pendingCallEnded: string | null = null

function flushPendingNativeCallEvents(): void {
  if (!bridgeHandlers) return
  if (pendingIncomingCall) {
    const call = pendingIncomingCall
    pendingIncomingCall = null
    bridgeHandlers.onIncomingCall(call)
  }
  if (pendingCallAnswered) {
    const event = pendingCallAnswered
    pendingCallAnswered = null
    bridgeHandlers.onCallAnswered(event.callId, event.declineToken)
  }
  if (pendingCallRejected) {
    const callId = pendingCallRejected
    pendingCallRejected = null
    bridgeHandlers.onCallRejected(callId)
  }
  if (pendingCallEnded) {
    const callId = pendingCallEnded
    pendingCallEnded = null
    bridgeHandlers.onCallEnded(callId)
  }
}

function attachNativeCallEventListeners(
  CapacitorPushCalls: Awaited<
    typeof import('@kapsula-chat/capacitor-push-calls')
  >['CapacitorPushCalls'],
): void {
  if (callListenersAttached) return

  CapacitorPushCalls.addListener('incomingCall', (call) => {
    const payload = call as NativeIncomingCallPayload
    cacheNativeDeclineToken(payload.callId, declineTokenFromIncoming(payload))
    if (bridgeHandlers) {
      bridgeHandlers.onIncomingCall(payload)
    } else {
      pendingIncomingCall = payload
    }
  })

  CapacitorPushCalls.addListener('callAnswered', (event) => {
    const callId = event.callId
    if (!callId) return
    const fromEvent = (event as { callId?: string; declineToken?: string }).declineToken
    const token =
      (typeof fromEvent === 'string' ? fromEvent : undefined) || getCachedNativeDeclineToken(callId)
    if (token) cacheNativeDeclineToken(callId, token)
    if (bridgeHandlers) {
      bridgeHandlers.onCallAnswered(callId, token)
    } else {
      pendingCallAnswered = { callId, declineToken: token }
    }
  })

  CapacitorPushCalls.addListener('callRejected', ({ callId }) => {
    if (!callId) return
    if (bridgeHandlers) {
      bridgeHandlers.onCallRejected(callId)
    } else {
      pendingCallRejected = callId
    }
  })

  CapacitorPushCalls.addListener('callEnded', ({ callId }) => {
    if (!callId) return
    if (bridgeHandlers) {
      bridgeHandlers.onCallEnded(callId)
    } else {
      pendingCallEnded = callId
    }
  })

  callListenersAttached = true
}

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

  CapacitorPushCalls.addListener('registrationError', ({ error }) => {
    console.error('[NativePush] registration error:', error)
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
    attachNativeCallEventListeners(CapacitorPushCalls)
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
  attachNativeCallEventListeners(CapacitorPushCalls)

  if (!bridgeInitialized) {
    bridgeInitialized = true
  }

  flushPendingNativeCallEvents()

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

export type NativeAudioRoute = 'speaker' | 'earpiece'

/** Route call audio to the loudspeaker or earpiece (iOS CallKit / Android ConnectionService). */
export async function setNativeAudioRoute(route: NativeAudioRoute): Promise<boolean> {
  if (!isNativeVoiceCallApp()) return false
  try {
    const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
    await CapacitorPushCalls.setAudioRoute({ route })
    return true
  } catch (error) {
    console.error('[NativeCall] setAudioRoute failed:', error)
    return false
  }
}

type NativeVoiceCallAudioPlugin = {
  setVoiceCallAudioActive?: (options: { active: boolean }) => Promise<void>
  startCallRing?: (options: { url: string }) => Promise<void>
  stopCallRing?: () => Promise<void>
}

/** Android: MODE_IN_COMMUNICATION + voice-call volume stream so hardware keys adjust call volume. */
export async function setNativeVoiceCallAudioActive(active: boolean): Promise<void> {
  if (!isNativeAndroidCallApp()) return
  try {
    const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
    const plugin = CapacitorPushCalls as typeof CapacitorPushCalls & NativeVoiceCallAudioPlugin
    if (typeof plugin.setVoiceCallAudioActive !== 'function') return
    await plugin.setVoiceCallAudioActive({ active })
  } catch (error) {
    console.error('[NativeCall] setVoiceCallAudioActive failed:', error)
  }
}

/** Android: play unanswered-call ring on STREAM_VOICE_CALL so volume keys change ring loudness. */
export async function startNativeCallRing(url: string): Promise<void> {
  if (!isNativeAndroidCallApp()) return
  try {
    const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
    const plugin = CapacitorPushCalls as typeof CapacitorPushCalls & NativeVoiceCallAudioPlugin
    if (typeof plugin.startCallRing !== 'function') return
    await plugin.startCallRing({ url })
  } catch (error) {
    console.error('[NativeCall] startCallRing failed:', error)
  }
}

export async function stopNativeCallRing(): Promise<void> {
  if (!isNativeAndroidCallApp()) return
  try {
    const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
    const plugin = CapacitorPushCalls as typeof CapacitorPushCalls & NativeVoiceCallAudioPlugin
    if (typeof plugin.stopCallRing !== 'function') return
    await plugin.stopCallRing()
  } catch (error) {
    console.error('[NativeCall] stopCallRing failed:', error)
  }
}
