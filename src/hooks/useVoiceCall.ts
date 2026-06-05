'use client'

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { getIceServers } from '@/lib/voiceCallConfig'
import {
  markOpenedFromCallNotification,
  retryVoiceCallAnnouncement,
  stopVoiceCallRingtone,
  VOICE_CALL_RING_TIMEOUT_MS,
} from '@/lib/voiceCallRingtone'
import { requestOpenTalkChat } from '@/lib/talkChatOpen'

export interface VoiceCallUser {
  id: string
  username: string
  name: string | null
  avatar: string | null
}

export type VoiceCallState = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'ended'

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
    body: JSON.stringify({ action, ...body }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Voice call failed')
  }
  return data
}

export function useVoiceCall({ currentUserId, enabled, onError }: UseVoiceCallOptions) {
  const [callState, setCallState] = useState<VoiceCallState>('idle')
  const [remoteUser, setRemoteUser] = useState<VoiceCallUser | null>(null)
  const [callId, setCallId] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
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
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([])
  const remoteDescriptionSetRef = useRef(false)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const callStateRef = useRef<VoiceCallState>('idle')
  callStateRef.current = callState
  const pendingVoiceActionRef = useRef<'accept' | 'reject' | null>(null)

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

  const resetCall = useCallback(() => {
    stopVoiceCallRingtone()
    stopLocalStream()
    closePeerConnection()
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
    }
    callIdRef.current = null
    isCallerRef.current = false
    makingOfferRef.current = false
    pendingOfferRef.current = null
    pendingIceRef.current = []
    remoteDescriptionSetRef.current = false
    remoteStreamRef.current = null
    pendingVoiceActionRef.current = null
    setCallId(null)
    setRemoteUser(null)
    setIsMuted(false)
    setCallState('idle')
  }, [closePeerConnection, stopLocalStream])

  const sendSignal = useCallback(async (type: string, payload: Record<string, unknown>) => {
    const id = callIdRef.current
    if (!id) return
    await voiceApi('signal', { callId: id, type, payload })
  }, [])

  const reattachRemoteAudio = useCallback(() => {
    const audio = remoteAudioRef.current
    const stream = remoteStreamRef.current
    if (!audio || !stream) return
    if (audio.srcObject !== stream) {
      audio.srcObject = stream
    }
    void audio.play().catch(() => {})
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

  const ensureLocalAudio = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream
      return stream
    } catch {
      reportError('Microphone access is required for voice calls')
      throw new Error('Microphone denied')
    }
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

  const endCall = useCallback(async () => {
    await endCallOnServer()
    resetCall()
  }, [endCallOnServer, resetCall])

  const createPeerConnection = useCallback(() => {
    closePeerConnection()
    remoteDescriptionSetRef.current = false

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
      } else if (pc.connectionState === 'failed') {
        reportError('Call connection failed')
        void endCall()
      }
    }

    pcRef.current = pc
    return pc
  }, [closePeerConnection, endCall, reattachRemoteAudio, reportError, sendSignal])

  const attachLocalTracks = useCallback(async (pc: RTCPeerConnection) => {
    const stream = await ensureLocalAudio()
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream)
    }
  }, [ensureLocalAudio])

  const createAndSendOffer = useCallback(async () => {
    if (makingOfferRef.current || !callIdRef.current) return
    makingOfferRef.current = true
    try {
      const pc = createPeerConnection()
      await attachLocalTracks(pc)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await sendSignal('offer', { sdp: offer })
      if (callStateRef.current === 'outgoing') {
        retryVoiceCallAnnouncement()
      }
    } finally {
      makingOfferRef.current = false
    }
  }, [attachLocalTracks, createPeerConnection, sendSignal])

  const storePendingOffer = useCallback((payload: Record<string, unknown>) => {
    const sdp = payload?.sdp as RTCSessionDescriptionInit | undefined
    if (sdp) {
      pendingOfferRef.current = sdp
    }
  }, [])

  const handleRemoteOffer = useCallback(
    async (signal: PollSignal, caller: VoiceCallUser) => {
      storePendingOffer(signal.payload)
      callIdRef.current = signal.callId
      setCallId(signal.callId)
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
      const pc = pcRef.current
      const sdp = payload.sdp as RTCSessionDescriptionInit | undefined
      if (!pc || !sdp) return
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      remoteDescriptionSetRef.current = true
      await flushPendingIceCandidates(pc)
      setCallState('connecting')
      reattachRemoteAudio()
    },
    [flushPendingIceCandidates, reattachRemoteAudio],
  )

  const handleRemoteIce = useCallback(async (payload: Record<string, unknown>) => {
    const pc = pcRef.current
    const candidate = payload.candidate as RTCIceCandidateInit | undefined
    if (!candidate) return
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

  const rejectCall = useCallback(async () => {
    const id = callIdRef.current
    if (!id) {
      resetCall()
      return
    }
    try {
      await voiceApi('reject', { callId: id })
    } catch {
      // best effort
    }
    resetCall()
  }, [resetCall])

  const resolvePendingOffer = useCallback(async (callId: string) => {
    if (pendingOfferRef.current) return pendingOfferRef.current

    const res = await fetch(`/api/chat/voice?since=${encodeURIComponent(new Date(0).toISOString())}`)
    if (!res.ok) return null
    const data = await res.json()
    const offerSignal = (data.signals as PollSignal[] | undefined)?.find(
      (s) => s.callId === callId && s.type === 'offer',
    )
    const sdp = offerSignal?.payload?.sdp as RTCSessionDescriptionInit | undefined
    if (sdp) {
      pendingOfferRef.current = sdp
      return sdp
    }
    return null
  }, [])

  const answerCall = useCallback(async () => {
    const id = callIdRef.current
    if (!id) return
    try {
      const offerSdp = await resolvePendingOffer(id)
      if (!offerSdp) {
        reportError('Could not connect — offer missing')
        await endCall()
        return
      }

      await voiceApi('accept', { callId: id })
      const pc = createPeerConnection()
      await attachLocalTracks(pc)

      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp))
      remoteDescriptionSetRef.current = true
      await flushPendingIceCandidates(pc)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await sendSignal('answer', { sdp: answer })
      pendingOfferRef.current = null
      setCallState('connecting')
      reattachRemoteAudio()
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'Failed to answer call')
      await endCall()
    }
  }, [attachLocalTracks, createPeerConnection, endCall, flushPendingIceCandidates, reportError, reattachRemoteAudio, resolvePendingOffer, sendSignal])

  const startCall = useCallback(
    async (peer: VoiceCallUser, conversationId?: string | null) => {
      if (!currentUserId || callState !== 'idle') return
      try {
        setRemoteUser(peer)
        setCallState('outgoing')
        isCallerRef.current = true

        const data = await voiceApi('initiate', {
          calleeId: peer.id,
          conversationId: conversationId || undefined,
        })
        const call = data.call as { id: string }
        callIdRef.current = call.id
        setCallId(call.id)
        await createAndSendOffer()
      } catch (err) {
        reportError(err instanceof Error ? err.message : 'Failed to start call')
        await endCall()
      }
    },
    [callState, createAndSendOffer, currentUserId, endCall, reportError],
  )

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const next = !isMuted
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !next
    })
    setIsMuted(next)
  }, [isMuted])

  const processPoll = useCallback(
    async (data: {
      incomingCalls?: PollIncomingCall[]
      signals?: PollSignal[]
      activeCall?: { id: string; status: string; caller: VoiceCallUser; callee: VoiceCallUser } | null
    }) => {
      pollSinceRef.current = new Date().toISOString()

      if (callState === 'idle' && data.incomingCalls?.length) {
        const incoming = data.incomingCalls[0]
        if (!handledIncomingRef.current.has(`call-${incoming.id}`)) {
          handledIncomingRef.current.add(`call-${incoming.id}`)
          callIdRef.current = incoming.id
          setCallId(incoming.id)
          setRemoteUser(incoming.caller)
          isCallerRef.current = false
          setCallState('incoming')
        }
      }

      for (const signal of data.signals || []) {
        if (
          (signal.type === 'hangup' || signal.type === 'reject') &&
          callStateRef.current === 'idle' &&
          pendingVoiceActionRef.current
        ) {
          pendingVoiceActionRef.current = null
        }

        if (signal.type === 'offer') {
          storePendingOffer(signal.payload)
          if (callState === 'idle') {
            const caller = data.incomingCalls?.find((c) => c.id === signal.callId)?.caller
            if (caller) {
              await handleRemoteOffer(signal, caller)
            }
          }
          continue
        }

        if (signal.callId !== callIdRef.current) continue

        if (signal.type === 'answer') {
          await handleRemoteAnswer(signal.payload)
        } else if (signal.type === 'ice') {
          await handleRemoteIce(signal.payload)
        } else if (signal.type === 'hangup' || signal.type === 'reject') {
          resetCall()
        }
      }
    },
    [callState, handleRemoteAnswer, handleRemoteIce, handleRemoteOffer, resetCall, storePendingOffer],
  )

  const runPendingVoiceAction = useCallback(() => {
    const action = pendingVoiceActionRef.current
    if (!action || callStateRef.current !== 'incoming') return
    pendingVoiceActionRef.current = null
    if (action === 'accept') void answerCall()
    else void rejectCall()
  }, [answerCall, rejectCall])

  const applyIncomingCall = useCallback((callId: string, caller: VoiceCallUser) => {
    if (callStateRef.current !== 'idle' && callStateRef.current !== 'incoming') return
    if (handledIncomingRef.current.has(`call-${callId}`)) {
      runPendingVoiceAction()
      return
    }
    handledIncomingRef.current.add(`call-${callId}`)
    callIdRef.current = callId
    setCallId(callId)
    setRemoteUser(caller)
    isCallerRef.current = false
    setCallState('incoming')
  }, [runPendingVoiceAction])

  useEffect(() => {
    if (callState === 'incoming') {
      runPendingVoiceAction()
    }
  }, [callState, runPendingVoiceAction])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('voiceIncoming') !== '1') return

    markOpenedFromCallNotification()
    requestOpenTalkChat()

    const action = params.get('voiceAction')
    if (action === 'accept' || action === 'reject') {
      pendingVoiceActionRef.current = action
    }

    const callId = params.get('callId')
    if (callId) {
      callIdRef.current = callId
      setCallId(callId)
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

    let lock: WakeLockSentinel | null = null
    void navigator.wakeLock.request('screen').then((l) => {
      lock = l
    }).catch(() => {})

    return () => {
      void lock?.release()
    }
  }, [callState])

  // Auto-drop an unanswered call after the ring timeout (caller hangs up,
  // callee rejects). The timer is cleared once the call connects or ends.
  useEffect(() => {
    if (callState !== 'outgoing' && callState !== 'incoming') return

    const timer = window.setTimeout(() => {
      if (callStateRef.current === 'outgoing') void endCall()
      else if (callStateRef.current === 'incoming') void rejectCall()
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
        pendingVoiceActionRef.current = 'accept'
        requestOpenTalkChat()
        if (data.caller) applyIncomingCall(data.callId, data.caller)
        return
      }
      if (data.type === 'VOICE_CALL_REJECT') {
        pendingVoiceActionRef.current = 'reject'
        if (data.caller) {
          applyIncomingCall(data.callId, data.caller)
        } else if (callStateRef.current === 'incoming') {
          void rejectCall()
        } else if (data.callId) {
          callIdRef.current = data.callId
          setCallId(data.callId)
          void rejectCall()
        }
        return
      }
      if (data.type === 'VOICE_CALL_INCOMING' && data.caller) {
        requestOpenTalkChat()
        applyIncomingCall(data.callId, data.caller)
      }
    }

    navigator.serviceWorker.addEventListener('message', onSwMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage)
  }, [applyIncomingCall, enabled, rejectCall])

  useEffect(() => {
    if (!enabled || !currentUserId) return

    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch(
          `/api/chat/voice?since=${encodeURIComponent(pollSinceRef.current)}`,
          { cache: 'no-store' },
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
    const intervalMs = hidden
      ? callState === 'idle'
        ? 1500
        : 800
      : callState === 'idle'
        ? 4000
        : 1200
    const timer = window.setInterval(poll, intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [callState, currentUserId, enabled, processPoll])

  useEffect(() => {
    if (!enabled || !currentUserId) return
    const onVisible = () => {
      if (!document.hidden) {
        void fetch(`/api/chat/voice?since=${encodeURIComponent(pollSinceRef.current)}`, {
          cache: 'no-store',
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
    remoteAudioRef,
    reattachRemoteAudio,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    lastError,
    clearLastError,
  }
}
