'use client'

import { createContext, useContext, useEffect, type MutableRefObject, type ReactNode } from 'react'
import { registerVoiceCallPush } from '@/lib/pushSubscriptionClient'
import { installVoiceCallAudioUnlock } from '@/lib/voiceCallRingtone'
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

  useEffect(() => {
    installVoiceCallAudioUnlock()
  }, [])

  useEffect(() => {
    if (!session?.user?.id) return
    void registerVoiceCallPush()
  }, [session?.user?.id])

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
      )}
      {session?.user && showFloatingOverlay && <VoiceCallOverlayPanel placement="floating" />}
    </VoiceCallContext.Provider>
  )
}

export function useVoiceCallContext() {
  return useContext(VoiceCallContext)
}
