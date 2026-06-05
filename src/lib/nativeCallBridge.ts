'use client'

import { Capacitor } from '@capacitor/core'

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
let bridgeHandlers: NativeCallBridgeHandlers | null = null

export function isNativeCallApp(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform()
}

export function isNativeIosCallApp(): boolean {
  return isNativeCallApp() && Capacitor.getPlatform() === 'ios'
}

/** Register PushKit + CallKit listeners (native iOS app only). */
export async function initNativeCallBridge(handlers: NativeCallBridgeHandlers): Promise<boolean> {
  if (!isNativeIosCallApp()) return false
  if (bridgeInitialized && bridgeHandlers === handlers) return true

  bridgeHandlers = handlers

  const { CapacitorPushCalls } = await import('@kapsula-chat/capacitor-push-calls')

  if (!bridgeInitialized) {
    await CapacitorPushCalls.registerVoipNotifications()

    CapacitorPushCalls.addListener('voipPushToken', async ({ token }) => {
      try {
        await fetch('/api/push/voip-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, platform: 'ios' }),
        })
      } catch (error) {
        console.error('VoIP token registration failed:', error)
      }
    })

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
