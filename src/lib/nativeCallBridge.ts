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
  /** CallKit already showing Accept/Decline — do not show in-app incoming overlay. */
  callKitOnly?: boolean
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

export interface NativeCallAnsweredOptions {
  declineToken?: string
  /** Foreground answer: run WebRTC in WKWebView with session cookies. */
  useSessionWebRtc?: boolean
  /** Lock-screen answer: Swift NativeVoiceCallEngine owns media — JS syncs UI only. */
  nativeWebRtc?: boolean
}

export interface NativeCallBridgeHandlers {
  onIncomingCall: (call: NativeIncomingCallPayload) => void
  onCallAnswered: (callId: string, options?: NativeCallAnsweredOptions) => void
  onCallRejected: (callId: string) => void
  onCallEnded: (callId: string) => void
  onNativeCallConnected?: (payload: {
    callId: string
    caller?: {
      id: string
      username: string
      name: string | null
      avatar: string | null
    }
  }) => void
}

let bridgeInitialized = false
let callListenersAttached = false
let nativePushBootstrapped = false
let pushListenerAttached = false
let bridgeHandlers: NativeCallBridgeHandlers | null = null
let pendingNativeToken: string | null = null
let pendingNativePlatform: 'ios' | 'android' | null = null
let pendingNativeUserId: string | null = null
let iosNativeCredentialsStored = false
let lastUploadedPushToken: { token: string; platform: 'ios' | 'android'; userId: string } | null = null
let subscribeNativePushInFlight: Promise<void> | null = null
let lastSubscribeNativePushAt = 0

const IOS_JS_SUBSCRIBE_MIN_GAP_MS = 5 * 60 * 1000
let pendingIncomingCall: NativeIncomingCallPayload | null = null
let pendingCallAnswered: {
  callId: string
  declineToken?: string
  useSessionWebRtc?: boolean
  nativeWebRtc?: boolean
} | null = null
let pendingCallRejected: string | null = null
let pendingCallEnded: string | null = null
let pendingNativeConnected: {
  callId: string
  caller?: {
    id: string
    username: string
    name: string | null
    avatar: string | null
  }
} | null = null
let webViewInjectListenerAttached = false

function attachWebViewCallKitInjectListener(): void {
  if (!isNativeIosCallApp() || typeof window === 'undefined' || webViewInjectListenerAttached) return
  webViewInjectListenerAttached = true

  window.addEventListener('aimediatank-callkit-end', (event) => {
    const callId = (event as CustomEvent<{ callId?: string }>).detail?.callId
    if (!callId) return
    if (bridgeHandlers) {
      bridgeHandlers.onCallEnded(callId)
    } else {
      pendingCallEnded = callId
    }
  })

  window.addEventListener('aimediatank-callkit-answer', (event) => {
    const detail = (event as CustomEvent<{
      callId?: string
      declineToken?: string
      useSessionWebRtc?: boolean
      nativeWebRtc?: boolean
    }>).detail
    const callId = detail?.callId
    if (!callId) return
    const token = detail.declineToken || getCachedNativeDeclineToken(callId)
    if (token) cacheNativeDeclineToken(callId, token)
    const payload = {
      callId,
      declineToken: token,
      useSessionWebRtc: Boolean(detail?.useSessionWebRtc) || undefined,
      nativeWebRtc: Boolean(detail?.nativeWebRtc) || undefined,
    }
    if (bridgeHandlers) {
      bridgeHandlers.onCallAnswered(callId, payload)
    } else {
      pendingCallAnswered = payload
    }
  })

  window.addEventListener('aimediatank-native-call-connected', (event) => {
    const detail = (event as CustomEvent<{
      callId?: string
      caller?: {
        id?: string
        username?: string
        name?: string | null
        avatar?: string | null
      }
    }>).detail
    const callId = detail?.callId
    if (!callId) return
    const caller = detail.caller
    const payload = {
      callId,
      caller:
        caller?.id && caller?.username
          ? {
              id: caller.id,
              username: caller.username,
              name: caller.name ?? null,
              avatar: caller.avatar ?? null,
            }
          : undefined,
    }
    if (bridgeHandlers?.onNativeCallConnected) {
      bridgeHandlers.onNativeCallConnected(payload)
    } else {
      pendingNativeConnected = payload
    }
  })
}

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
    bridgeHandlers.onCallAnswered(event.callId, event)
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
  if (pendingNativeConnected && bridgeHandlers.onNativeCallConnected) {
    const payload = pendingNativeConnected
    pendingNativeConnected = null
    bridgeHandlers.onNativeCallConnected(payload)
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
    const extended = event as {
      callId?: string
      declineToken?: string
      useSessionWebRtc?: boolean
      nativeWebRtc?: boolean
    }
    const fromEvent = extended.declineToken
    const token =
      (typeof fromEvent === 'string' ? fromEvent : undefined) || getCachedNativeDeclineToken(callId)
    if (token) cacheNativeDeclineToken(callId, token)
    const payload = {
      callId,
      declineToken: token,
      useSessionWebRtc: Boolean(extended.useSessionWebRtc) || undefined,
      nativeWebRtc: Boolean(extended.nativeWebRtc) || undefined,
    }
    if (bridgeHandlers) {
      bridgeHandlers.onCallAnswered(callId, payload)
    } else {
      pendingCallAnswered = payload
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

type NativePushCredentialsPlugin = {
  storeNativePushCredentials?: (options: { userId: string; registerKey: string }) => Promise<void>
}

async function storeIosNativePushCredentials(userId: string, registerKey: string): Promise<void> {
  if (!isNativeIosCallApp() || !userId || !registerKey) return
  try {
    const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
    const plugin = CapacitorPushCalls as typeof CapacitorPushCalls & NativePushCredentialsPlugin
    if (typeof plugin.storeNativePushCredentials === 'function') {
      await plugin.storeNativePushCredentials({ userId, registerKey })
      iosNativeCredentialsStored = true
      console.info('[NativePush] stored iOS native push credentials for offline PushKit sync')
    }
  } catch (error) {
    console.warn('[NativePush] storeNativePushCredentials failed:', error)
  }
}

async function subscribeNativePushToken(
  token: string,
  platform: 'ios' | 'android',
  userId?: string,
): Promise<boolean> {
  const normalizedToken = platform === 'ios' ? token.trim().toLowerCase() : token.trim()
  const resolvedUserId = userId ?? pendingNativeUserId ?? undefined

  // iOS: Swift PushKit bridge uploads via voip-subscribe-native once credentials exist.
  if (platform === 'ios' && iosNativeCredentialsStored) {
    return true
  }

  if (
    resolvedUserId &&
    lastUploadedPushToken?.token === normalizedToken &&
    lastUploadedPushToken.platform === platform &&
    lastUploadedPushToken.userId === resolvedUserId
  ) {
    return true
  }

  try {
    const res = await fetch('/api/push/voip-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: normalizedToken, platform }),
      credentials: 'include',
    })
    if (res.status === 401) {
      pendingNativeToken = normalizedToken
      pendingNativePlatform = platform
      if (userId) pendingNativeUserId = userId
      console.warn(`[NativePush] ${platform} token received but user not signed in yet`)
      return false
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error(`[NativePush] ${platform} token registration failed:`, res.status, body)
      return false
    }
    const body = (await res.json().catch(() => ({}))) as {
      nativeRegisterKey?: string
      unchanged?: boolean
    }
    pendingNativeToken = null
    pendingNativePlatform = null
    if (platform === 'ios' && resolvedUserId && body.nativeRegisterKey) {
      pendingNativeUserId = resolvedUserId
      await storeIosNativePushCredentials(resolvedUserId, body.nativeRegisterKey)
      iosNativeCredentialsStored = true
    }
    if (resolvedUserId) {
      lastUploadedPushToken = {
        token: normalizedToken,
        platform,
        userId: resolvedUserId,
      }
    }
    if (!body.unchanged) {
      console.info(`[NativePush] ${platform} device token saved for signed-in user`)
    }
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
    if (isNativeIosCallApp() && iosNativeCredentialsStored) {
      return
    }
    void subscribeNativePushToken(token, 'ios', pendingNativeUserId ?? undefined)
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
export async function subscribeNativePushIfNeeded(userId?: string): Promise<void> {
  if (!isNativeVoiceCallApp()) return
  if (userId) pendingNativeUserId = userId

  const now = Date.now()
  if (
    isNativeIosCallApp() &&
    iosNativeCredentialsStored &&
    now - lastSubscribeNativePushAt < IOS_JS_SUBSCRIBE_MIN_GAP_MS
  ) {
    return
  }

  if (subscribeNativePushInFlight) {
    await subscribeNativePushInFlight
    return
  }

  subscribeNativePushInFlight = (async () => {
    lastSubscribeNativePushAt = Date.now()
    await bootstrapNativePush()

    if (pendingNativeToken && pendingNativePlatform) {
      await subscribeNativePushToken(
        pendingNativeToken,
        pendingNativePlatform,
        userId ?? pendingNativeUserId ?? undefined,
      )
    } else if (
      isNativeIosCallApp() &&
      userId &&
      !iosNativeCredentialsStored
    ) {
      try {
        const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
        await CapacitorPushCalls.registerVoipNotifications()
      } catch {
        // bridge may still hold PushKit registration
      }
    }
  })()

  try {
    await subscribeNativePushInFlight
  } finally {
    subscribeNativePushInFlight = null
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
  attachWebViewCallKitInjectListener()
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
  setCallRingVolume?: (options: { level: number }) => Promise<void>
}

/** Android: media-stream WebRTC; hardware keys adjust STREAM_MUSIC (see MainActivity). */
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

export async function endNativeCall(callId: string | null | undefined): Promise<void> {
  if (!isNativeVoiceCallApp() || !callId) return
  try {
    const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
    await CapacitorPushCalls.endCall({ callId })
  } catch {
    // ignore when native UI already dismissed the call
  }
}

/** Android: native ring on STREAM_MUSIC so hardware volume keys control loudness. */
export async function startNativeCallRing(url: string): Promise<void> {
  if (!isNativeAndroidCallApp()) return
  try {
    const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
    const plugin = CapacitorPushCalls as typeof CapacitorPushCalls & NativeVoiceCallAudioPlugin
    if (typeof plugin.startCallRing !== 'function') return
    await plugin.startCallRing({ url })
  } catch (error) {
    console.error('[NativeCall] startCallRing failed:', error)
    throw error
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

/** Android: adjust native MediaPlayer ring loudness (0–1). */
export async function setNativeCallRingVolume(level: number): Promise<void> {
  if (!isNativeAndroidCallApp()) return
  try {
    const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')
    const plugin = CapacitorPushCalls as typeof CapacitorPushCalls & NativeVoiceCallAudioPlugin
    if (typeof plugin.setCallRingVolume !== 'function') return
    await plugin.setCallRingVolume({ level: Math.max(0, Math.min(1, level)) })
  } catch (error) {
    console.error('[NativeCall] setCallRingVolume failed:', error)
  }
}
