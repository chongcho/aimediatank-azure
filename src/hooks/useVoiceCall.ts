'use client'

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { getIceServers } from '@/lib/voiceCallConfig'

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

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null) as MutableRefObject<HTMLAudioElement | null>
  const callIdRef = useRef<string | null>(null)
  const pollSinceRef = useRef<string>(new Date(0).toISOString())
  const isCallerRef = useRef(false)
  const makingOfferRef = useRef(false)
  const handledIncomingRef = useRef<Set<string>>(new Set())
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null)

  const reportError = useCallback(
    (message: string) => {
      onError?.(message)
    },
    [onError],
  )

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
  }, [])

  const closePeerConnection = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
  }, [])

  const resetCall = useCallback(() => {
    stopLocalStream()
    closePeerConnection()
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
    }
    callIdRef.current = null
    isCallerRef.current = false
    makingOfferRef.current = false
    pendingOfferRef.current = null
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

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: getIceServers() })

    pc.onicecandidate = (event) => {
      if (event.candidate && callIdRef.current) {
        void sendSignal('ice', { candidate: event.candidate.toJSON() })
      }
    }

    pc.ontrack = (event) => {
      const audio = remoteAudioRef.current
      if (audio && event.streams[0]) {
        audio.srcObject = event.streams[0]
        void audio.play().catch(() => {})
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState('connected')
      } else if (pc.connectionState === 'failed') {
        reportError('Call connection failed')
        resetCall()
      }
    }

    pcRef.current = pc
    return pc
  }, [reportError, resetCall, sendSignal])

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
      setCallState('connecting')
    } finally {
      makingOfferRef.current = false
    }
  }, [attachLocalTracks, createPeerConnection, sendSignal])

  const handleRemoteOffer = useCallback(
    async (signal: PollSignal, caller: VoiceCallUser) => {
      callIdRef.current = signal.callId
      setCallId(signal.callId)
      setRemoteUser(caller)
      isCallerRef.current = false
      setCallState('incoming')

      if (handledIncomingRef.current.has(signal.id)) return
      handledIncomingRef.current.add(signal.id)
    },
    [],
  )

  const handleRemoteAnswer = useCallback(
    async (payload: Record<string, unknown>) => {
      const pc = pcRef.current
      const sdp = payload.sdp as RTCSessionDescriptionInit | undefined
      if (!pc || !sdp) return
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      setCallState('connecting')
    },
    [],
  )

  const handleRemoteIce = useCallback(async (payload: Record<string, unknown>) => {
    const pc = pcRef.current
    const candidate = payload.candidate as RTCIceCandidateInit | undefined
    if (!pc || !candidate) return
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
    } catch {
      // ICE can arrive before remote description; ignore transient errors
    }
  }, [])

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

  const answerCall = useCallback(async () => {
    const id = callIdRef.current
    if (!id) return
    try {
      await voiceApi('accept', { callId: id })
      const pc = createPeerConnection()
      await attachLocalTracks(pc)

      let offerSdp = pendingOfferRef.current
      if (!offerSdp) {
        const res = await fetch(`/api/chat/voice?since=${encodeURIComponent(new Date(0).toISOString())}`)
        const data = await res.json()
        const offerSignal = (data.signals as PollSignal[] | undefined)?.find(
          (s) => s.callId === id && s.type === 'offer',
        )
        if (offerSignal?.payload?.sdp) {
          offerSdp = offerSignal.payload.sdp as RTCSessionDescriptionInit
        }
      }

      if (offerSdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(offerSdp))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await sendSignal('answer', { sdp: answer })
        pendingOfferRef.current = null
        setCallState('connecting')
      } else {
        reportError('Could not connect — offer missing')
        await endCall()
      }
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'Failed to answer call')
      resetCall()
    }
  }, [attachLocalTracks, createPeerConnection, endCall, reportError, resetCall, sendSignal])

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
        resetCall()
      }
    },
    [callState, createAndSendOffer, currentUserId, reportError, resetCall],
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
        if (signal.type === 'offer' && callState === 'idle') {
          const caller = data.incomingCalls?.find((c) => c.id === signal.callId)?.caller
          if (caller) {
            await handleRemoteOffer(signal, caller)
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
        } else if (signal.type === 'offer') {
          const sdp = signal.payload?.sdp as RTCSessionDescriptionInit | undefined
          if (sdp) {
            pendingOfferRef.current = sdp
          }
          if (!isCallerRef.current && callState === 'idle') {
            // incoming offer before call row was seen
          }
        }
      }
    },
    [callState, handleRemoteAnswer, handleRemoteIce, handleRemoteOffer, resetCall],
  )

  useEffect(() => {
    if (!enabled || !currentUserId) return

    let cancelled = false
    const poll = async () => {
      if (cancelled || document.hidden) return
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
    const intervalMs = callState === 'idle' ? 4000 : 1200
    const timer = window.setInterval(poll, intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [callState, currentUserId, enabled, processPoll])

  useEffect(() => {
    return () => {
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
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
  }
}
