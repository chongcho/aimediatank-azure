'use client'

import { createContext, useContext, type ReactNode } from 'react'
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
}

const VoiceCallContext = createContext<VoiceCallContextValue | null>(null)

export function VoiceCallProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const { localeTag } = useUiLocale()
  const tr = talkChatTr(localeTag)

  const voiceCall = useVoiceCall({
    currentUserId: session?.user?.id,
    enabled: Boolean(session?.user),
  })

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
      }}
    >
      {children}
      {session?.user && (
        <VoiceCallOverlay
          callState={voiceCall.callState}
          remoteUser={voiceCall.remoteUser}
          isMuted={voiceCall.isMuted}
          remoteAudioRef={voiceCall.remoteAudioRef}
          labels={{
            incomingCall: tr[TC.voiceIncomingCall],
            calling: tr[TC.voiceCalling],
            connecting: tr[TC.voiceConnecting],
            connected: tr[TC.voiceConnected],
            accept: tr[TC.accept],
            reject: tr[TC.cancel],
            endCall: tr[TC.voiceEndCall],
            mute: tr[TC.voiceMute],
            unmute: tr[TC.voiceUnmute],
          }}
          onAccept={() => void voiceCall.answerCall()}
          onReject={() => void voiceCall.rejectCall()}
          onEnd={() => void voiceCall.endCall()}
          onToggleMute={voiceCall.toggleMute}
        />
      )}
    </VoiceCallContext.Provider>
  )
}

export function useVoiceCallContext() {
  return useContext(VoiceCallContext)
}
