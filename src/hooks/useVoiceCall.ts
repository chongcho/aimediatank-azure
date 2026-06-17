'use client'

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { getIceServers } from '@/lib/voiceCallConfig'
import {
  markOpenedFromCallNotification,
  markVoiceCallUserGesture,
  retryVoiceCallRingtone,
  stopVoiceCallRingtone,
  VOICE_CALL_RING_TIMEOUT_MS,
} from '@/lib/voiceCallRingtone'
import { requestOpenTalkChat } from '@/lib/talkChatOpen'
import {
  clearNativeCallScreenPresentation,
  endNativeCall,
  endNativeWebRtc,
  getCachedNativeDeclineToken,
  initNativeCallBridge,
  isNativeAndroidCallApp,
  isNativeIosCallApp,
  isNativeVoiceCallApp,
  markNativeCallConnected,
  cacheNativeDeclineToken,
  prepareNativeWebRtcAnswer,
  prepareNativeWebRtcCaller,
  reportIncomingCallToNativeUi,
  setNativeAudioRoute,
  setNativeVoiceCallAudioActive,
  setNativeVoiceCallMediaVolume,
  setNativeWebRtcMuted,
  type NativeIncomingCallPayload,
} from '@/lib/nativeCallBridge'
import { normalizeVoiceCallId, voiceCallIdsMatch } from '@/lib/voiceCallId'
import { getVoiceCallVoiceVolume, setVoiceCallVoiceVolume } from '@/lib/voiceCallVolume'

export interface VoiceCallUser {
  id: string
  username: string
  name: string | null
  avatar: string | null
}

export type VoiceCallState = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'ended'

/** CallKit owns the ring on iOS — in-app incoming overlay (#1) must not appear. */
function shouldSuppressIosIncomingUi(call?: NativeIncomingCallPayload): boolean {
  if (!isNativeIosCallApp()) return false
  if (call?.callKitOnly) return true
  return typeof document !== 'undefined' && document.hidden
}

interface UseVoiceCallOptions {
  currentUserId: string | undefined
  enabled: boolean
  onError?: (message: string) => void
}

interface PollSignal {
  id: string
  callId: string
  fromUserId: string
  type: string
  payload: Record<string, unknown>
  createdAt?: string
}

interface PollIncomingCall {
  id: string
  caller: VoiceCallUser
  conversationId: string | null
}

async function voiceApi(action: string, body: Record<string, unknown> = {}) {
  const res = await fetch('/api/chat/voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action, ...body }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Voice call failed')
  }
  return data
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getUserMediaWithTimeout(timeoutMs: number): Promise<MediaStream> {
  return Promise.race([
    navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
    sleep(timeoutMs).then(() => {
      throw new Error('getUserMedia timeout')
    }),
  ])
}

function normalizeIceCandidate(input: unknown): RTCIceCandidateInit | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>
  if (typeof obj.candidate === 'string') {
    const sdpMid = typeof obj.sdpMid === 'string' && obj.sdpMid.length > 0 ? obj.sdpMid : undefined
    return {
      candidate: obj.candidate,
      sdpMid,
      sdpMLineIndex: typeof obj.sdpMLineIndex === 'number' ? obj.sdpMLineIndex : undefined,
    }
  }
  if (obj.candidate && typeof obj.candidate === 'object') {
    return normalizeIceCandidate(obj.candidate)
  }
  return null
}

function sdpTypeFromUnknown(value: unknown): RTCSdpType | null {
  if (value === 'offer' || value === 'answer' || value === 'pranswer' || value === 'rollback') {
    return value
  }
  if (value === 0 || value === '0') return 'offer'
  if (value === 1 || value === '1') return 'pranswer'
  if (value === 2 || value === '2') return 'answer'
  if (value === 3 || value === '3') return 'rollback'
  return null
}

function normalizeRemoteSdp(input: unknown): RTCSessionDescriptionInit | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>
  if (typeof obj.sdp === 'string') {
    const type = sdpTypeFromUnknown(obj.type)
    if (type) return { type, sdp: obj.sdp }
  }
  if (obj.sdp && typeof obj.sdp === 'object') {
    return normalizeRemoteSdp(obj.sdp)
  }
  return null
}

async function fetchNativeCallKitBootstrap(callId: string, token: string) {
  const params = new URLSearchParams({ callId, token })
  const res = await fetch(`/api/chat/voice/native-callkit?${params.toString()}`, {
    cache: 'no-store',
  })
  if (!res.ok) return null
  return res.json() as Promise<{
    status?: string
    caller?: VoiceCallUser
    offer?: { sdp?: RTCSessionDescriptionInit }
    iceCandidates?: Array<{ candidate?: RTCIceCandidateInit }>
  }>
}

async function logNativeCallKitDebug(callId: string, token: string, message: string) {
  try {
    await fetch('/api/chat/voice/native-callkit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'log', callId, token, message }),
    })
  } catch {
    // best effort
  }
}

async function nativeCallKitApi(
  action: 'accept' | 'signal',
  callId: string,
  token: string,
  extra: { type?: string; payload?: Record<string, unknown> } = {},
) {
  const res = await fetch('/api/chat/voice/native-callkit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, callId, token, ...extra }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Native callkit ${action} failed`)
  }
  return data
}

export function useVoiceCall({ currentUserId, enabled, onError }: UseVoiceCallOptions) {
  const [callState, setCallState] = useState<VoiceCallState>('idle')
  const [remoteUser, setRemoteUser] = useState<VoiceCallUser | null>(null)
  const [callId, setCallId] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null) as MutableRefObject<HTMLAudioElement | null>
  const callIdRef = useRef<string | null>(null)
  const pollSinceRef = useRef<string>(new Date(0).toISOString())
  const isCallerRef = useRef(false)
  const makingOfferRef = useRef(false)
  const handledIncomingRef = useRef<Set<string>>(new Set())
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null)
  const pendingAnswerRef = useRef<RTCSessionDescriptionInit | null>(null)
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([])
  const remoteDescriptionSetRef = useRef(false)
  const localOfferSetRef = useRef(false)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const callStateRef = useRef<VoiceCallState>('idle')
  callStateRef.current = callState
  const pendingVoiceActionRef = useRef<'accept' | 'reject' | null>(null)
  const answeringRef = useRef(false)
  /** Decline token for lock-screen CallKit answer — routes ICE via native-callkit (no web session). */
  const nativeSignalingTokenRef = useRef<string | null>(null)
  /** One in-flight lock-screen answer handler per call (native retries must not spawn duplicates). */
  const callKitAnswerInFlightRef = useRef<string | null>(null)
  const appliedNativeIceRef = useRef<Set<string>>(new Set())
  const appliedRemoteIceRef = useRef<Set<string>>(new Set())
  /** True while answering via lock-screen CallKit — routes ICE/answer through native-callkit API. */
  const callKitSignalingRef = useRef(false)
  /** iOS callee accepted via Swift NativeVoiceCallEngine — JS poll must not consume caller ICE. */
  const nativeWebRtcCalleeRef = useRef(false)
  /** Android uses Kotlin NativeVoiceWebRtcEngine — JS must not use WebView RTCPeerConnection. */
  const nativeWebRtcAndroidRef = useRef(false)

  const reportError = useCallback(
    (message: string) => {
      setLastError(message)
      onError?.(message)
    },
    [onError],
  )

  const clearLastError = useCallback(() => {
    setLastError(null)
  }, [])

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
  }, [])

  const closePeerConnection = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
  }, [])

  const resetCall = useCallback((options?: { endNativeUi?: boolean }) => {
    const id = callIdRef.current ? normalizeVoiceCallId(callIdRef.current) : null
    const state = callStateRef.current
    const endNativeUi = options?.endNativeUi ?? true
    stopVoiceCallRingtone()
    if (isNativeAndroidCallApp()) {
      void setNativeVoiceCallAudioActive(false)
      void clearNativeCallScreenPresentation()
      void endNativeWebRtc()
    }
    if (id && endNativeUi) {
      // iOS incoming ring is owned by CallKit — session poll must not dismiss native UI.
      const shouldEndNative =
        !isNativeIosCallApp() ||
        state === 'incoming' ||
        state === 'connecting' ||
        state === 'connected' ||
        state === 'outgoing'
      if (shouldEndNative) {
        handledIncomingRef.current.delete(`call-${id}`)
        void endNativeCall(id)
      }
    } else if (id) {
      handledIncomingRef.current.delete(`call-${id}`)
    }
    stopLocalStream()
    closePeerConnection()
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
      remoteAudioRef.current.muted = false
    }
    callIdRef.current = null
    isCallerRef.current = false
    makingOfferRef.current = false
    pendingOfferRef.current = null
    pendingAnswerRef.current = null
    pendingIceRef.current = []
    remoteDescriptionSetRef.current = false
    localOfferSetRef.current = false
    remoteStreamRef.current = null
    pendingVoiceActionRef.current = null
    nativeSignalingTokenRef.current = null
    appliedNativeIceRef.current.clear()
    appliedRemoteIceRef.current.clear()
    callKitSignalingRef.current = false
    nativeWebRtcCalleeRef.current = false
    nativeWebRtcAndroidRef.current = false
    setCallId(null)
    setRemoteUser(null)
    setIsMuted(false)
    setIsSpeakerOn(false)
    setCallState('idle')
  }, [closePeerConnection, stopLocalStream])

  const playRemoteAudioElement = useCallback((stream: MediaStream) => {
    if (isNativeAndroidCallApp() && nativeWebRtcAndroidRef.current) return
    const audio = remoteAudioRef.current
    if (!audio) return

    const tryPlay = async (attempt = 0) => {
      // Remote WebRTC must play after native loudspeaker routing (silent on earpiece/WebView otherwise).
      if (isNativeAndroidCallApp()) {
        await setNativeVoiceCallAudioActive(true)
        await setNativeAudioRoute('speaker')
        await setNativeVoiceCallMediaVolume(getVoiceCallVoiceVolume())
      }
      if (audio.srcObject !== stream) {
        audio.srcObject = stream
      }
      audio.muted = false
      audio.volume = isNativeAndroidCallApp() ? 1 : getVoiceCallVoiceVolume()
      try {
        await audio.play()
      } catch {
        if (attempt < 15 && remoteStreamRef.current === stream) {
          await sleep(isNativeAndroidCallApp() ? 250 : 150)
          await tryPlay(attempt + 1)
        }
      }
    }
    void tryPlay()
  }, [])

  const reattachRemoteAudio = useCallback(() => {
    const stream = remoteStreamRef.current
    if (!stream) return
    playRemoteAudioElement(stream)
  }, [playRemoteAudioElement])

  const setRemoteCallVolume = useCallback((level: number) => {
    const v = setVoiceCallVoiceVolume(level)
    if (isNativeAndroidCallApp()) {
      void setNativeVoiceCallMediaVolume(v)
      const audio = remoteAudioRef.current
      if (audio && !audio.muted) {
        audio.volume = 1
      }
      return
    }
    const audio = remoteAudioRef.current
    if (audio && !audio.muted) {
      audio.volume = v
    }
  }, [])

  const sendSignal = useCallback(async (type: string, payload: Record<string, unknown>) => {
    const id = callIdRef.current
    if (!id) return
    const token =
      nativeSignalingTokenRef.current ||
      getCachedNativeDeclineToken(id)
    if (token && !isCallerRef.current && callKitSignalingRef.current) {
      try {
        await nativeCallKitApi('signal', id, token, { type, payload })
        return
      } catch (err) {
        console.warn('[VoiceCall] native signal failed, retrying with session:', type, err)
      }
    }
    await voiceApi('signal', { callId: id, type, payload })
  }, [])

  const flushPendingIceCandidates = useCallback(async (pc: RTCPeerConnection) => {
    if (!remoteDescriptionSetRef.current || pendingIceRef.current.length === 0) return

    const queued = pendingIceRef.current
    pendingIceRef.current = []
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch {
        pendingIceRef.current.push(candidate)
      }
    }
  }, [])

  const queueRemoteIceCandidate = useCallback((candidate: RTCIceCandidateInit) => {
    pendingIceRef.current.push(candidate)
  }, [])

  const ensureLocalAudio = useCallback(async (retries = 0) => {
    if (localStreamRef.current) return localStreamRef.current
    const maxAttempts = 1 + Math.max(0, retries)
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const stream = await getUserMediaWithTimeout(attempt === 0 ? 8000 : 12000)
        localStreamRef.current = stream
        return stream
      } catch {
        if (attempt === maxAttempts - 1) {
          reportError('Microphone access is required for voice calls')
          throw new Error('Microphone denied')
        }
        await sleep(350 + attempt * 250)
      }
    }
    throw new Error('Microphone denied')
  }, [reportError])

  const endCallOnServer = useCallback(async () => {
    const id = callIdRef.current
    if (!id) return
    try {
      await voiceApi('end', { callId: id })
    } catch {
      // best effort
    }
  }, [])

  const endCall = useCallback(async (overrideCallId?: string) => {
    const id = normalizeVoiceCallId(overrideCallId || callIdRef.current)
    if (id) callIdRef.current = id
    await endCallOnServer()
    await endNativeCall(id)
    resetCall()
  }, [endCallOnServer, resetCall])

  const createPeerConnection = useCallback(() => {
    closePeerConnection()
    remoteDescriptionSetRef.current = false
    localOfferSetRef.current = false

    const pc = new RTCPeerConnection({ iceServers: getIceServers() })

    pc.onicecandidate = (event) => {
      if (event.candidate && callIdRef.current) {
        void sendSignal('ice', { candidate: event.candidate.toJSON() })
      }
    }

    pc.ontrack = (event) => {
      const stream =
        event.streams[0] ??
        (event.track ? new MediaStream([event.track]) : null)
      if (!stream) return
      remoteStreamRef.current = stream
      reattachRemoteAudio()
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState('connected')
        reattachRemoteAudio()
        if (callIdRef.current) {
          void markNativeCallConnected(callIdRef.current)
        }
      } else if (pc.connectionState === 'failed') {
        reportError('Call connection failed')
        void endCall()
      }
    }

    pcRef.current = pc
    return pc
  }, [closePeerConnection, endCall, reattachRemoteAudio, reportError, sendSignal])

  const attachLocalTracks = useCallback(async (pc: RTCPeerConnection, mediaRetries = 0) => {
    const stream = await ensureLocalAudio(mediaRetries)
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream)
    }
  }, [ensureLocalAudio])

  const applyRemoteAnswer = useCallback(
    async (sdp: RTCSessionDescriptionInit) => {
      const pc = pcRef.current
      if (!pc) {
        pendingAnswerRef.current = sdp
        return false
      }
      if (isCallerRef.current && !localOfferSetRef.current) {
        pendingAnswerRef.current = sdp
        return false
      }
      if (remoteDescriptionSetRef.current) return true
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp))
        remoteDescriptionSetRef.current = true
        pendingAnswerRef.current = null
        await flushPendingIceCandidates(pc)
        setCallState('connecting')
        reattachRemoteAudio()
        console.info('[VoiceCall] applied remote answer', callIdRef.current)
        return true
      } catch (err) {
        console.warn('[VoiceCall] failed to apply remote answer:', err)
        pendingAnswerRef.current = sdp
        return false
      }
    },
    [flushPendingIceCandidates, reattachRemoteAudio],
  )

  const createAndSendOffer = useCallback(async () => {
    if (makingOfferRef.current || !callIdRef.current) return
    makingOfferRef.current = true
    try {
      if (isNativeAndroidCallApp()) {
        nativeWebRtcAndroidRef.current = true
        await prepareNativeWebRtcCaller(callIdRef.current, getIceServers())
        if (callStateRef.current === 'outgoing') {
          retryVoiceCallRingtone()
        }
        return
      }
      const pc = createPeerConnection()
      await attachLocalTracks(pc)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      localOfferSetRef.current = true
      await sendSignal('offer', { sdp: offer })
      if (pendingAnswerRef.current) {
        await applyRemoteAnswer(pendingAnswerRef.current)
      }
      if (callStateRef.current === 'outgoing' && !isNativeIosCallApp()) {
        retryVoiceCallRingtone()
      }
    } finally {
      makingOfferRef.current = false
    }
  }, [applyRemoteAnswer, attachLocalTracks, createPeerConnection, sendSignal])

  const storePendingOffer = useCallback((payload: Record<string, unknown>) => {
    const sdp = payload?.sdp as RTCSessionDescriptionInit | undefined
    if (sdp) {
      pendingOfferRef.current = sdp
    }
  }, [])

  const handleRemoteOffer = useCallback(
    async (signal: PollSignal, caller: VoiceCallUser) => {
      storePendingOffer(signal.payload)
      // iOS: VoIP push + App bridge own CallKit; Android/other use JS native UI fallback.
      const needsNativeUiFallback = !isNativeVoiceCallApp() || isNativeAndroidCallApp()
      if (needsNativeUiFallback) {
        const label = caller.name || caller.username || 'AiMediaTank'
        void reportIncomingCallToNativeUi({
          callId: signal.callId,
          handle: caller.username || caller.id,
          displayName: label,
          caller,
        })
      }
      callIdRef.current = normalizeVoiceCallId(signal.callId)
      setCallId(normalizeVoiceCallId(signal.callId))
      setRemoteUser(caller)
      isCallerRef.current = false
      setCallState('incoming')

      if (handledIncomingRef.current.has(signal.id)) return
      handledIncomingRef.current.add(signal.id)
    },
    [storePendingOffer],
  )

  const handleRemoteAnswer = useCallback(
    async (payload: Record<string, unknown>) => {
      const sdp = normalizeRemoteSdp(payload.sdp ?? payload)
      if (!sdp) {
        console.warn('[VoiceCall] ignored remote answer — unparsable SDP payload')
        return
      }
      await applyRemoteAnswer(sdp)
    },
    [applyRemoteAnswer],
  )

  const handleRemoteIce = useCallback(async (payload: Record<string, unknown>) => {
    const pc = pcRef.current
    const candidate = normalizeIceCandidate(payload.candidate ?? payload)
    if (!candidate) return
    const candidateKey = JSON.stringify(candidate)
    if (appliedRemoteIceRef.current.has(candidateKey)) return
    appliedRemoteIceRef.current.add(candidateKey)
    if (!pc || !remoteDescriptionSetRef.current) {
      queueRemoteIceCandidate(candidate)
      return
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
    } catch {
      queueRemoteIceCandidate(candidate)
    }
  }, [queueRemoteIceCandidate])

  const refreshNativeIceFromServer = useCallback(
    async (callId: string, token: string) => {
      const bootstrap = await fetchNativeCallKitBootstrap(callId, token)
      if (!bootstrap?.iceCandidates?.length) return
      for (const row of bootstrap.iceCandidates) {
        if (!row?.candidate) continue
        const key = JSON.stringify(row.candidate)
        if (appliedNativeIceRef.current.has(key)) continue
        appliedNativeIceRef.current.add(key)
        await handleRemoteIce({ candidate: row.candidate })
      }
    },
    [handleRemoteIce],
  )

  const rejectCall = useCallback(async (overrideCallId?: string) => {
    const id = normalizeVoiceCallId(overrideCallId || callIdRef.current)
    if (!id) {
      resetCall()
      return
    }
    callIdRef.current = id
    try {
      await voiceApi('reject', { callId: id })
    } catch {
      try {
        await voiceApi('end', { callId: id })
      } catch {
        // best effort
      }
    }
    await endNativeCall(id)
    resetCall()
  }, [resetCall])

  const resetCallKitWebRtcState = useCallback(() => {
    closePeerConnection()
    stopLocalStream()
    pendingOfferRef.current = null
    pendingAnswerRef.current = null
    pendingIceRef.current = []
    remoteDescriptionSetRef.current = false
    localOfferSetRef.current = false
    remoteStreamRef.current = null
  }, [closePeerConnection, stopLocalStream])

  const resolvePendingOffer = useCallback(async (
    callId: string,
    declineToken?: string,
    forceRefresh = false,
  ) => {
    if (!forceRefresh && pendingOfferRef.current) return pendingOfferRef.current

    if (declineToken) {
      for (let attempt = 0; attempt < 60; attempt++) {
        try {
          const bootstrap = await fetchNativeCallKitBootstrap(callId, declineToken)
          const sdp = normalizeRemoteSdp(bootstrap?.offer?.sdp ?? bootstrap?.offer)
          if (sdp) {
            pendingOfferRef.current = sdp
            pendingIceRef.current = []
            for (const row of bootstrap?.iceCandidates || []) {
              if (row?.candidate) {
                pendingIceRef.current.push(row.candidate)
              }
            }
            if (bootstrap?.caller) {
              setRemoteUser(bootstrap.caller)
            }
            return sdp
          }
        } catch {
          // retry bootstrap until offer is stored
        }
        if (attempt < 59) {
          await sleep(500)
        }
      }
    }

    try {
      const res = await fetch(`/api/chat/voice?since=${encodeURIComponent(new Date(0).toISOString())}`, {
        cache: 'no-store',
        credentials: 'include',
      })
      if (!res.ok) return null
      const data = await res.json()
      const offerSignal = (data.signals as PollSignal[] | undefined)?.find(
        (s) => voiceCallIdsMatch(s.callId, callId) && s.type === 'offer',
      )
      const sdp = normalizeRemoteSdp(offerSignal?.payload?.sdp ?? offerSignal?.payload)
      if (sdp) {
        pendingOfferRef.current = sdp
        return sdp
      }
    } catch {
      // retry path may call again
    }
    return null
  }, [])

  const answerCall = useCallback(async (opts?: { fromCallKit?: boolean; declineToken?: string }): Promise<boolean> => {
    if (answeringRef.current) return false
    if (
      !opts?.fromCallKit &&
      callStateRef.current === 'connected'
    ) {
      return false
    }
    if (
      !opts?.fromCallKit &&
      callStateRef.current === 'connecting' &&
      !isNativeAndroidCallApp()
    ) {
      return false
    }
    const id = callIdRef.current
    if (!id) return false
    const declineToken =
      opts?.declineToken ||
      nativeSignalingTokenRef.current ||
      getCachedNativeDeclineToken(id)
    if (declineToken) {
      nativeSignalingTokenRef.current = declineToken
      cacheNativeDeclineToken(id, declineToken)
    }
    markVoiceCallUserGesture()
    answeringRef.current = true
    try {
      if (isNativeAndroidCallApp()) {
        nativeWebRtcAndroidRef.current = true
        const offerSdp = await resolvePendingOffer(
          id,
          opts?.fromCallKit ? declineToken : undefined,
        )
        if (!offerSdp && !opts?.fromCallKit) {
          reportError('Could not connect — offer missing')
          await endCall()
          return false
        }
        if (!opts?.fromCallKit) {
          await voiceApi('accept', { callId: id })
          await prepareNativeWebRtcAnswer(id, declineToken)
        } else if (!declineToken) {
          await prepareNativeWebRtcAnswer(id)
        }
        pendingOfferRef.current = null
        setCallState('connecting')
        requestOpenTalkChat()
        return true
      }

      const offerSdp = await resolvePendingOffer(
        id,
        opts?.fromCallKit ? declineToken : undefined,
      )
      if (!offerSdp) {
        if (opts?.fromCallKit) return false
        reportError('Could not connect — offer missing')
        await endCall()
        return false
      }

      if (opts?.fromCallKit && declineToken) {
        await nativeCallKitApi('accept', id, declineToken)
      } else if (!opts?.fromCallKit) {
        await voiceApi('accept', { callId: id })
      }

      const pc = createPeerConnection()
      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp))
      remoteDescriptionSetRef.current = true
      await flushPendingIceCandidates(pc)
      await attachLocalTracks(pc, opts?.fromCallKit ? 16 : 0)

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      if (opts?.fromCallKit && declineToken) {
        await nativeCallKitApi('signal', id, declineToken, {
          type: 'answer',
          payload: { sdp: answer },
        })
      } else {
        await sendSignal('answer', { sdp: answer })
      }
      pendingOfferRef.current = null
      setCallState('connecting')
      reattachRemoteAudio()
      if (isNativeIosCallApp()) {
        // CallKit owns in-call UI — do not open TalkChat / home WebView.
      } else if (isNativeVoiceCallApp()) {
        requestOpenTalkChat()
      }
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (opts?.fromCallKit) {
        resetCallKitWebRtcState()
        console.warn('[VoiceCall] CallKit answer attempt failed:', message)
        if (declineToken) {
          void logNativeCallKitDebug(id, declineToken, `answer failed: ${message}`)
        }
        return false
      }
      reportError(message || 'Failed to answer call')
      await endCall()
      return false
    } finally {
      answeringRef.current = false
    }
  }, [attachLocalTracks, createPeerConnection, endCall, flushPendingIceCandidates, reportError, reattachRemoteAudio, resetCallKitWebRtcState, resolvePendingOffer, sendSignal])

  const startCall = useCallback(
    async (peer: VoiceCallUser, conversationId?: string | null) => {
      if (!currentUserId || callState !== 'idle') return
      markVoiceCallUserGesture()
      try {
        setRemoteUser(peer)
        setCallState('outgoing')
        isCallerRef.current = true

        const data = await voiceApi('initiate', {
          calleeId: peer.id,
          conversationId: conversationId || undefined,
        })
        const call = data.call as { id: string }
        const id = normalizeVoiceCallId(call.id)
        callIdRef.current = id
        setCallId(id)
        await createAndSendOffer()
      } catch (err) {
        reportError(err instanceof Error ? err.message : 'Failed to start call')
        await endCall()
      }
    },
    [callState, createAndSendOffer, currentUserId, endCall, reportError],
  )

  const toggleMute = useCallback(() => {
    const next = !isMuted
    if (isNativeAndroidCallApp() && nativeWebRtcAndroidRef.current) {
      void setNativeWebRtcMuted(next)
      setIsMuted(next)
      return
    }
    const stream = localStreamRef.current
    if (!stream) return
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !next
    })
    setIsMuted(next)
  }, [isMuted])

  const toggleSpeaker = useCallback(() => {
    if (!isNativeVoiceCallApp()) return
    const next = !isSpeakerOn
    void setNativeAudioRoute(next ? 'speaker' : 'earpiece').then((ok) => {
      if (ok) setIsSpeakerOn(next)
    })
  }, [isSpeakerOn])

  useEffect(() => {
    if (callState !== 'connected' || !isNativeIosCallApp()) return
    setIsSpeakerOn(true)
  }, [callState])

  useEffect(() => {
    if (!isNativeAndroidCallApp()) return
    const active = callState === 'connecting' || callState === 'connected'
    if (!active) {
      void setNativeVoiceCallAudioActive(false)
      return
    }
    void (async () => {
      await setNativeVoiceCallAudioActive(true)
      setIsSpeakerOn(true)
      await setNativeAudioRoute('speaker')
      await setNativeVoiceCallMediaVolume(getVoiceCallVoiceVolume())
      reattachRemoteAudio()
    })()
  }, [callState, reattachRemoteAudio])

  const processPoll = useCallback(
    async (data: {
      incomingCalls?: PollIncomingCall[]
      signals?: PollSignal[]
      activeCall?: { id: string; status: string; caller: VoiceCallUser; callee: VoiceCallUser } | null
      endedCalls?: { id: string; status: string }[]
    }) => {
      const returnedSignals = data.signals || []
      if (returnedSignals.length > 0) {
        let maxCreatedAt = pollSinceRef.current
        for (const signal of returnedSignals) {
          if (signal.createdAt && signal.createdAt > maxCreatedAt) {
            maxCreatedAt = signal.createdAt
          }
        }
        pollSinceRef.current = maxCreatedAt
      } else {
        pollSinceRef.current = new Date().toISOString()
      }

      for (const signal of returnedSignals) {
        if (
          (signal.type === 'hangup' || signal.type === 'reject') &&
          callStateRef.current === 'idle' &&
          pendingVoiceActionRef.current
        ) {
          pendingVoiceActionRef.current = null
        }

        if (signal.type === 'offer') {
          storePendingOffer(signal.payload)
          const iosForegroundInApp =
            isNativeIosCallApp() &&
            typeof document !== 'undefined' &&
            !document.hidden
          if (callState === 'idle' && !iosForegroundInApp) {
            const caller = data.incomingCalls?.find((c) => c.id === signal.callId)?.caller
            if (caller) {
              await handleRemoteOffer(signal, caller)
            }
          }
          continue
        }

        if (!voiceCallIdsMatch(signal.callId, callIdRef.current)) continue

        if (
          (isNativeIosCallApp() && nativeWebRtcCalleeRef.current) ||
          (isNativeAndroidCallApp() && nativeWebRtcAndroidRef.current)
        ) {
          if (signal.type === 'ice' || signal.type === 'answer') {
            continue
          }
        }

        if (signal.type === 'answer') {
          await handleRemoteAnswer(signal.payload)
        } else if (signal.type === 'ice') {
          await handleRemoteIce(signal.payload)
        } else if (signal.type === 'hangup' || signal.type === 'reject') {
          resetCall({ endNativeUi: isNativeIosCallApp() })
        }
      }

      const localCallId = callIdRef.current
      const localState = callStateRef.current
      if (
        localCallId &&
        (localState === 'outgoing' ||
          localState === 'incoming' ||
          localState === 'connecting' ||
          localState === 'connected')
      ) {
        const ended = data.endedCalls?.some((c) => voiceCallIdsMatch(c.id, localCallId))
        if (isNativeIosCallApp() && ended) {
          resetCall({ endNativeUi: true })
          return
        }
        const stillActive =
          data.activeCall?.id &&
          voiceCallIdsMatch(data.activeCall.id, localCallId) &&
          (data.activeCall.status === 'ringing' || data.activeCall.status === 'active')
        const stillIncoming =
          data.incomingCalls?.some((c) => voiceCallIdsMatch(c.id, localCallId)) ?? false
        if (isNativeIosCallApp() && localState === 'incoming') {
          // CallKit owns the ring (#1 only) — never tear down native UI from poll heuristics.
          if (ended) {
            resetCall({ endNativeUi: true })
            return
          }
          if (stillActive || stillIncoming) return
          return
        }
        if (
          ended ||
          (data.activeCall && !voiceCallIdsMatch(data.activeCall.id, localCallId)) ||
          (!stillActive && !data.activeCall)
        ) {
          resetCall()
          return
        }
      }

      if (callState === 'idle' && data.incomingCalls?.length) {
        const incoming = data.incomingCalls[0]
        if (!handledIncomingRef.current.has(`call-${incoming.id}`)) {
          handledIncomingRef.current.add(`call-${incoming.id}`)
          callIdRef.current = normalizeVoiceCallId(incoming.id)
          setCallId(normalizeVoiceCallId(incoming.id))
          setRemoteUser(incoming.caller)
          isCallerRef.current = false
          // iOS: lock-screen + foreground rings use CallKit only — poll must not drive in-app incoming UI.
          if (isNativeIosCallApp()) {
            return
          }
          setCallState('incoming')
          if (!isNativeIosCallApp()) {
            const label = incoming.caller.name || incoming.caller.username || 'AiMediaTank'
            void reportIncomingCallToNativeUi({
              callId: incoming.id,
              handle: incoming.caller.username || incoming.caller.id,
              displayName: label,
              caller: incoming.caller,
            })
          }
        }
      }
    },
    [callState, handleRemoteAnswer, handleRemoteIce, handleRemoteOffer, resetCall, storePendingOffer],
  )

  const runPendingVoiceAction = useCallback(() => {
    const action = pendingVoiceActionRef.current
    if (!action || callStateRef.current !== 'incoming') return
    // iOS: Accept/Decline only via system CallKit (#1), not web notification / URL deep links.
    if (isNativeIosCallApp()) {
      pendingVoiceActionRef.current = null
      return
    }
    pendingVoiceActionRef.current = null
    if (action === 'accept') void answerCall()
    else void rejectCall()
  }, [answerCall, rejectCall])

  const applyIncomingCall = useCallback((callId: string, caller: VoiceCallUser, opts?: { callKitOnly?: boolean }) => {
    const normalizedId = normalizeVoiceCallId(callId)
    if (callStateRef.current === 'connecting' || callStateRef.current === 'connected') {
      callIdRef.current = normalizedId
      setCallId(normalizedId)
      setRemoteUser(caller)
      isCallerRef.current = false
      return
    }
    if (shouldSuppressIosIncomingUi({ callKitOnly: opts?.callKitOnly } as NativeIncomingCallPayload)) {
      handledIncomingRef.current.add(`call-${normalizedId}`)
      callIdRef.current = normalizedId
      setCallId(normalizedId)
      setRemoteUser(caller)
      isCallerRef.current = false
      return
    }
    if (callStateRef.current !== 'idle' && callStateRef.current !== 'incoming') return
    if (handledIncomingRef.current.has(`call-${normalizedId}`)) {
      runPendingVoiceAction()
      return
    }
    handledIncomingRef.current.add(`call-${normalizedId}`)
    callIdRef.current = normalizedId
    setCallId(normalizedId)
    setRemoteUser(caller)
    isCallerRef.current = false
    setCallState('incoming')
  }, [runPendingVoiceAction])

  useEffect(() => {
    if (callState === 'incoming') {
      runPendingVoiceAction()
    }
  }, [callState, runPendingVoiceAction])

  const applyIncomingCallRef = useRef(applyIncomingCall)
  applyIncomingCallRef.current = applyIncomingCall
  const answerCallRef = useRef(answerCall)
  answerCallRef.current = answerCall
  const rejectCallRef = useRef(rejectCall)
  rejectCallRef.current = rejectCall
  const endCallRef = useRef(endCall)
  endCallRef.current = endCall
  const resetCallRef = useRef(resetCall)
  resetCallRef.current = resetCall
  const reattachRemoteAudioRef = useRef(reattachRemoteAudio)
  reattachRemoteAudioRef.current = reattachRemoteAudio
  const resetCallKitWebRtcStateRef = useRef(resetCallKitWebRtcState)
  resetCallKitWebRtcStateRef.current = resetCallKitWebRtcState

  useEffect(() => {
    const shouldInitBridge = isNativeIosCallApp() || (enabled && Boolean(currentUserId))
    if (!shouldInitBridge) return

    const callerFromNative = (call: NativeIncomingCallPayload): VoiceCallUser | null => {
      const meta = call.metadata
      if (!meta?.callerId) return null
      return {
        id: meta.callerId,
        username: meta.callerUsername || meta.callerId,
        name: meta.callerName ?? null,
        avatar: meta.callerAvatar ?? null,
      }
    }

    const ensureIncomingCall = async (callId: string, call?: NativeIncomingCallPayload) => {
      const normalizedId = normalizeVoiceCallId(callId)
      callIdRef.current = normalizedId
      setCallId(normalizedId)
      isCallerRef.current = false

      const callKitOnly = shouldSuppressIosIncomingUi(call)

      if (voiceCallIdsMatch(callIdRef.current, normalizedId) && callStateRef.current === 'incoming') {
        return
      }

      const fromMeta = call ? callerFromNative(call) : null
      if (fromMeta) {
        applyIncomingCallRef.current(normalizedId, fromMeta, { callKitOnly })
        return
      }

      const lockScreenToken =
        nativeSignalingTokenRef.current || getCachedNativeDeclineToken(normalizedId)
      if (lockScreenToken) {
        nativeSignalingTokenRef.current = lockScreenToken
        cacheNativeDeclineToken(normalizedId, lockScreenToken)
        try {
          const bootstrap = await fetchNativeCallKitBootstrap(normalizedId, lockScreenToken)
          if (bootstrap?.caller) {
            applyIncomingCallRef.current(normalizedId, bootstrap.caller, { callKitOnly })
            return
          }
        } catch {
          // fall through to session poll
        }
      }

      if (callKitOnly) return

      try {
        const res = await fetch(
          `/api/chat/voice?since=${encodeURIComponent(new Date(0).toISOString())}`,
          { cache: 'no-store', credentials: 'include' },
        )
        if (!res.ok) return
        const data = await res.json()
        const incoming = (data.incomingCalls as PollIncomingCall[] | undefined)?.find((row) =>
          voiceCallIdsMatch(row.id, normalizedId),
        )
        if (incoming) {
          applyIncomingCallRef.current(normalizedId, incoming.caller)
          return
        }
      } catch {
        // poll fallback below on answer
      }

      setCallState('incoming')
    }

    void initNativeCallBridge({
      onIncomingCall: (call) => {
        if (!isNativeVoiceCallApp()) {
          stopVoiceCallRingtone()
        }
        const token =
          getCachedNativeDeclineToken(call.callId) ||
          call.declineToken ||
          call.metadata?.declineToken
        if (token) {
          cacheNativeDeclineToken(call.callId, token)
          nativeSignalingTokenRef.current = token
        }
        if (shouldSuppressIosIncomingUi(call)) {
          const normalizedId = normalizeVoiceCallId(call.callId)
          handledIncomingRef.current.add(`call-${normalizedId}`)
          callIdRef.current = normalizedId
          setCallId(normalizedId)
          isCallerRef.current = false
          const caller = callerFromNative(call)
          if (caller) setRemoteUser(caller)
          return
        }
        void ensureIncomingCall(call.callId, call)
      },
      onCallAnswered: (callId, options) => {
        stopVoiceCallRingtone()
        markVoiceCallUserGesture()
        const normalizedId = normalizeVoiceCallId(callId)
        const token =
          options?.declineToken || getCachedNativeDeclineToken(callId)
        if (token) {
          cacheNativeDeclineToken(callId, token)
          nativeSignalingTokenRef.current = token
        }

        const useSessionWebRtc = Boolean(options?.useSessionWebRtc)
        const nativeWebRtc = Boolean(options?.nativeWebRtc)

        // Lock-screen Accept: native engine owns WebRTC — JS must not start WebView RTCPeerConnection.
        if (nativeWebRtc && !useSessionWebRtc && isNativeVoiceCallApp()) {
          if (isNativeIosCallApp()) {
            nativeWebRtcCalleeRef.current = true
          } else {
            nativeWebRtcAndroidRef.current = true
          }
          callIdRef.current = normalizedId
          setCallId(normalizedId)
          isCallerRef.current = false
          if (callStateRef.current !== 'connected') {
            setCallState('connecting')
          }
          void ensureIncomingCall(callId)
          if (isNativeAndroidCallApp()) {
            requestOpenTalkChat()
            // Belt-and-suspenders: stop caller ring even if native HTTP accept races the bridge.
            void (async () => {
              try {
                if (token) {
                  await nativeCallKitApi('accept', normalizedId, token)
                } else {
                  await voiceApi('accept', { callId: normalizedId })
                }
              } catch (err) {
                console.warn('[VoiceCall] Android native accept sync failed:', err)
              }
            })()
          }
          return
        }

        if (isNativeAndroidCallApp()) {
          return
        }

        if (callKitAnswerInFlightRef.current === normalizedId) {
          if (callStateRef.current === 'connected') return
          if (answeringRef.current) return
        }
        callKitAnswerInFlightRef.current = normalizedId
        callKitSignalingRef.current = true

        void (async () => {
          try {
            callIdRef.current = normalizedId
            setCallId(normalizedId)
            isCallerRef.current = false
            setCallState('incoming')

            await ensureIncomingCall(callId)

            for (let attempt = 0; attempt < 60; attempt++) {
              if (callStateRef.current === 'connected') return
              if (callStateRef.current === 'idle') return

              const answered = await answerCallRef.current({
                fromCallKit: true,
                declineToken: token,
              })
              if (answered) {
                reattachRemoteAudioRef.current()
                return
              }

              await sleep(800)
            }

            reportError('Could not connect call')
            if (token) {
              void logNativeCallKitDebug(normalizedId, token, 'exhausted CallKit answer retries')
            }
            await endCallRef.current(normalizedId)
          } finally {
            callKitSignalingRef.current = false
            if (callKitAnswerInFlightRef.current === normalizedId) {
              callKitAnswerInFlightRef.current = null
            }
          }
        })()
      },
      onNativeCallConnected: (payload) => {
        const normalizedId = normalizeVoiceCallId(payload.callId)
        callKitAnswerInFlightRef.current = null
        callKitSignalingRef.current = false
        nativeWebRtcCalleeRef.current = false
        answeringRef.current = false
        callIdRef.current = normalizedId
        setCallId(normalizedId)
        if (payload.caller) {
          isCallerRef.current = false
          setRemoteUser(payload.caller)
        }
        setCallState('connected')
        if (!isNativeIosCallApp()) {
          requestOpenTalkChat()
        }
        void markNativeCallConnected(normalizedId)
      },
      onCallRejected: (callId) => {
        if (callIdRef.current && !voiceCallIdsMatch(callIdRef.current, callId)) return
        void rejectCallRef.current(callId)
      },
      onCallEnded: (callId) => {
        if (callIdRef.current && !voiceCallIdsMatch(callIdRef.current, callId)) return
        stopVoiceCallRingtone()
        callKitAnswerInFlightRef.current = null
        callKitSignalingRef.current = false
        nativeWebRtcCalleeRef.current = false
        nativeWebRtcAndroidRef.current = false
        const normalizedId = normalizeVoiceCallId(callId)
        void (async () => {
          const state = callStateRef.current
          // Native bridge / remote cancel already synced end — avoid POST /end feedback loop.
          const shouldSyncEnd =
            state === 'connected' ||
            state === 'connecting' ||
            state === 'outgoing' ||
            (state === 'incoming' && isCallerRef.current)
          if (shouldSyncEnd) {
            try {
              callIdRef.current = normalizedId
              await voiceApi('end', { callId: normalizedId })
            } catch {
              // Native bridge may have already synced end; still tear down locally.
            }
          }
          resetCallRef.current({ endNativeUi: true })
        })()
      },
    })
  }, [currentUserId, enabled, reportError, resetCallKitWebRtcState])

  // Android lock-screen answer: native WebRTC owns media — open TalkChat when WebView wakes.
  useEffect(() => {
    if (!enabled || !isNativeAndroidCallApp() || typeof document === 'undefined') return

    const syncNativeCallUi = () => {
      if (document.hidden) return
      if (!nativeWebRtcAndroidRef.current) return
      if (callStateRef.current === 'connected' || callStateRef.current === 'idle') return
      requestOpenTalkChat()
    }

    document.addEventListener('visibilitychange', syncNativeCallUi)
    window.addEventListener('pageshow', syncNativeCallUi)
    window.addEventListener('focus', syncNativeCallUi)
    return () => {
      document.removeEventListener('visibilitychange', syncNativeCallUi)
      window.removeEventListener('pageshow', syncNativeCallUi)
      window.removeEventListener('focus', syncNativeCallUi)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('voiceIncoming') !== '1') return

    markOpenedFromCallNotification()
    requestOpenTalkChat()

    const action = params.get('voiceAction')
    if (!isNativeIosCallApp() && (action === 'accept' || action === 'reject')) {
      pendingVoiceActionRef.current = action
    }

    const callId = params.get('callId')
    if (callId) {
      const id = normalizeVoiceCallId(callId)
      callIdRef.current = id
      setCallId(id)
      params.delete('voiceIncoming')
      params.delete('voiceAction')
      params.delete('callId')
      const next = params.toString()
      const nextUrl = next ? `${window.location.pathname}?${next}` : window.location.pathname
      window.history.replaceState({}, '', nextUrl)
    }
  }, [enabled])

  // Keep screen on while ringing or in a call (after user opens the app)
  useEffect(() => {
    const active =
      callState === 'incoming' ||
      callState === 'outgoing' ||
      callState === 'connecting' ||
      callState === 'connected'
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    let cancelled = false
    let lock: WakeLockSentinel | null = null
    void navigator.wakeLock.request('screen').then((l) => {
      if (cancelled) {
        void l.release()
        return
      }
      lock = l
    }).catch(() => {})

    return () => {
      cancelled = true
      void lock?.release()
    }
  }, [callState])

  // Auto-drop an unanswered call after the ring timeout (caller hangs up,
  // callee rejects). The timer is cleared once the call connects or ends.
  useEffect(() => {
    if (callState !== 'outgoing' && callState !== 'incoming') return

    const timer = window.setTimeout(() => {
      if (callStateRef.current === 'outgoing') void endCall()
      else if (callStateRef.current === 'incoming') {
        // iOS incoming ring is owned by CallKit; server cancel / VoIP push ends it.
        if (!isNativeIosCallApp()) void rejectCall()
      }
    }, VOICE_CALL_RING_TIMEOUT_MS)

    return () => window.clearTimeout(timer)
  }, [callState, endCall, rejectCall])

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const onSwMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string
        callId?: string
        caller?: VoiceCallUser
      } | null
      if (!data?.callId) return

      if (data.type === 'VOICE_CALL_ACCEPT') {
        if (isNativeIosCallApp()) return
        pendingVoiceActionRef.current = 'accept'
        requestOpenTalkChat()
        if (data.caller) applyIncomingCall(data.callId, data.caller)
        return
      }
      if (data.type === 'VOICE_CALL_REJECT') {
        if (isNativeIosCallApp()) return
        pendingVoiceActionRef.current = 'reject'
        if (data.caller) {
          applyIncomingCall(data.callId, data.caller)
        } else if (callStateRef.current === 'incoming') {
          void rejectCall()
        } else if (data.callId) {
          const id = normalizeVoiceCallId(data.callId)
          callIdRef.current = id
          setCallId(id)
          void rejectCall()
        }
        return
      }
      if (data.type === 'VOICE_CALL_INCOMING' && data.caller) {
        if (!isNativeIosCallApp()) {
          requestOpenTalkChat()
        }
        applyIncomingCall(data.callId, data.caller)
      }
    }

    navigator.serviceWorker.addEventListener('message', onSwMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage)
  }, [applyIncomingCall, enabled, rejectCall])

  useEffect(() => {
    if (!enabled) return
    const nativeCallWithoutSession =
      isNativeIosCallApp() &&
      callId != null &&
      Boolean(nativeSignalingTokenRef.current || getCachedNativeDeclineToken(callId))
    if (!currentUserId && !nativeCallWithoutSession) return

    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch(
          `/api/chat/voice?since=${encodeURIComponent(pollSinceRef.current)}`,
          { cache: 'no-store', credentials: 'include' },
        )
        if (!res.ok) return
        const data = await res.json()
        await processPoll(data)
      } catch {
        // ignore transient poll errors
      }
    }

    poll()
    const hidden = typeof document !== 'undefined' && document.hidden
    const fastPoll =
      callState === 'outgoing' ||
      callState === 'incoming' ||
      callState === 'connecting' ||
      callState === 'connected'
    const intervalMs = hidden
      ? fastPoll
        ? 350
        : callState === 'idle'
          ? 1500
          : 800
      : fastPoll
        ? 350
        : callState === 'idle'
          ? 4000
          : 1200
    const timer = window.setInterval(poll, intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [callId, callState, currentUserId, enabled, processPoll])

  useEffect(() => {
    if (!enabled || !currentUserId) return
    const onVisible = () => {
      if (!document.hidden) {
        void fetch(`/api/chat/voice?since=${encodeURIComponent(pollSinceRef.current)}`, {
          cache: 'no-store',
          credentials: 'include',
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data) return processPoll(data)
          })
          .catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [currentUserId, enabled, processPoll])

  useEffect(() => {
    return () => {
      stopVoiceCallRingtone()
      void endCallOnServer()
      stopLocalStream()
      closePeerConnection()
    }
  }, [closePeerConnection, endCallOnServer, stopLocalStream])

  return {
    callState,
    remoteUser,
    callId,
    isMuted,
    isSpeakerOn,
    remoteAudioRef,
    reattachRemoteAudio,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    setRemoteCallVolume,
    lastError,
    clearLastError,
  }
}
