'use client'

import { createContext, useContext, useEffect, useRef, type MutableRefObject, type ReactNode } from 'react'
import { registerVoiceCallPush } from '@/lib/pushSubscriptionClient'
import {
  attachIosIncomingRingAudio,
  attachIosOutgoingRingAudio,
  installVoiceCallAudioUnlock,
  primeVoiceCallAfterNotificationOpen,
  retryVoiceCallAnnouncement,
  startIncomingRingtone,
  startOutgoingRingback,
  stopVoiceCallRingtone,
} from '@/lib/voiceCallRingtone'
import { useSession } from 'next-auth/react'
import { useVoiceCall, type VoiceCallState, type VoiceCallUser } from '@/hooks/useVoiceCall'
import { VoiceCallOverlay } from '@/components/VoiceCallOverlay'
import { useUiLocale } from '@/hooks/useUiLocale'
import { talkChatIdx, talkChatTr } from '@/messages/talkChatStrings'

const TC = talkChatIdx

interface VoiceCallContextValue {
  callState: VoiceCallState
  remoteUser: VoiceCallUser | null
  startCall: (peer: VoiceCallUser, conversationId?: string | null) => Promise<void>
  answerCall: () => Promise<void>
  rejectCall: () => Promise<void>
  endCall: () => Promise<void>
  toggleMute: () => void
  isMuted: boolean
  lastError: string | null
  clearLastError: () => void
  remoteAudioRef: MutableRefObject<HTMLAudioElement | null>
}

const VoiceCallContext = createContext<VoiceCallContextValue | null>(null)

function useVoiceCallLabels() {
  const { localeTag } = useUiLocale()
  const tr = talkChatTr(localeTag)
  return {
    localeTag,
    incomingCall: tr[TC.voiceIncomingCall],
    calling: tr[TC.voiceCalling],
    connecting: tr[TC.voiceConnecting],
    connected: tr[TC.voiceConnected],
    accept: tr[TC.accept],
    reject: tr[TC.cancel],
    endCall: tr[TC.voiceEndCall],
    mute: tr[TC.voiceMute],
    unmute: tr[TC.voiceUnmute],
    inAppHint: tr[TC.voiceCallInAppHint],
  }
}

function formatCallAnnouncement(template: string, user: VoiceCallUser | null) {
  const name = (user?.name || user?.username || '').trim() || '?'
  return template.replace('{name}', name)
}

/** Renders active-call UI. Use embedded inside TalkChat; floating when chat is closed. */
export function VoiceCallOverlayPanel({
  placement = 'floating',
}: {
  placement?: 'floating' | 'embedded'
}) {
  const ctx = useVoiceCallContext()
  const { data: session } = useSession()
  const labels = useVoiceCallLabels()

  if (!session?.user || !ctx) return null

  return (
    <VoiceCallOverlay
      placement={placement}
      callState={ctx.callState}
      remoteUser={ctx.remoteUser}
      isMuted={ctx.isMuted}
      labels={labels}
      inAppHint={labels.inAppHint}
      onAccept={() => void ctx.answerCall()}
      onReject={() => void ctx.rejectCall()}
      onEnd={() => void ctx.endCall()}
      onToggleMute={ctx.toggleMute}
    />
  )
}

export function VoiceCallProvider({
  children,
  showFloatingOverlay = true,
}: {
  children: ReactNode
  /** When TalkChat is open, set false so only the in-panel overlay is shown */
  showFloatingOverlay?: boolean
}) {
  const { data: session } = useSession()

  const voiceCall = useVoiceCall({
    currentUserId: session?.user?.id,
    enabled: Boolean(session?.user),
  })
  const labels = useVoiceCallLabels()
  const callStateRef = useRef(voiceCall.callState)
  callStateRef.current = voiceCall.callState

  useEffect(() => {
    installVoiceCallAudioUnlock()
  }, [])

  useEffect(() => {
    if (!session?.user?.id) return
    void registerVoiceCallPush()
  }, [session?.user?.id])

  useEffect(() => {
    if (!session?.user) {
      stopVoiceCallRingtone()
      return
    }

    const state = voiceCall.callState
    if (state !== 'incoming' && state !== 'outgoing') {
      stopVoiceCallRingtone()
      return
    }

    const announcement = formatCallAnnouncement(
      state === 'incoming' ? labels.incomingCall : labels.calling,
      voiceCall.remoteUser,
    )
    const start =
      state === 'incoming' ? startIncomingRingtone : startOutgoingRingback
    start(announcement, labels.localeTag)
    primeVoiceCallAfterNotificationOpen()
  }, [
    session?.user?.id,
    voiceCall.callState,
    voiceCall.remoteUser?.id,
    voiceCall.remoteUser?.name,
    voiceCall.remoteUser?.username,
    labels.incomingCall,
    labels.calling,
    labels.localeTag,
  ])

  // iOS may block speech until the user touches the screen — retry when the tab is visible.
  useEffect(() => {
    if (!session?.user) return

    const onVisible = () => {
      if (document.hidden) return
      primeVoiceCallAfterNotificationOpen()
      const state = callStateRef.current
      if (state === 'incoming' || state === 'outgoing') {
        retryVoiceCallAnnouncement()
      }
    }

    primeVoiceCallAfterNotificationOpen()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [session?.user])

  return (
    <VoiceCallContext.Provider
      value={{
        callState: voiceCall.callState,
        remoteUser: voiceCall.remoteUser,
        startCall: voiceCall.startCall,
        answerCall: voiceCall.answerCall,
        rejectCall: voiceCall.rejectCall,
        endCall: voiceCall.endCall,
        toggleMute: voiceCall.toggleMute,
        isMuted: voiceCall.isMuted,
        lastError: voiceCall.lastError,
        clearLastError: voiceCall.clearLastError,
        remoteAudioRef: voiceCall.remoteAudioRef,
      }}
    >
      {children}
      {session?.user && (
        <>
          <audio
            ref={attachIosIncomingRingAudio}
            src="/sounds/incoming-ring.wav"
            loop
            playsInline
            preload="auto"
            aria-hidden
            style={{ display: 'none' }}
          />
          <audio
            ref={attachIosOutgoingRingAudio}
            src="/sounds/outgoing-ring.wav"
            loop
            playsInline
            preload="auto"
            aria-hidden
            style={{ display: 'none' }}
          />
          <audio
            ref={(el) => {
              voiceCall.remoteAudioRef.current = el
              if (el) voiceCall.reattachRemoteAudio()
            }}
            autoPlay
            playsInline
            aria-hidden
            style={{ display: 'none' }}
          />
        </>
      )}
      {session?.user && showFloatingOverlay && <VoiceCallOverlayPanel placement="floating" />}
    </VoiceCallContext.Provider>
  )
}

export function useVoiceCallContext() {
  return useContext(VoiceCallContext)
}
