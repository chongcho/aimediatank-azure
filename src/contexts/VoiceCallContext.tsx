'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { registerVoiceCallPush, installPushSubscriptionRefresh } from '@/lib/pushSubscriptionClient'
import {
  answerNativeCall,
  bootstrapNativePush,
  isNativeCallApp,
  isNativeIosCallApp,
  isNativeAndroidCallApp,
  isNativeVoiceCallApp,
  subscribeNativePushIfNeeded,
} from '@/lib/nativeCallBridge'
import {
  installVoiceCallAudioUnlock,
  primeVoiceCallAfterNotificationOpen,
  retryVoiceCallRingtone,
  startIncomingRingtone,
  startOutgoingRingback,
  stopVoiceCallRingtone,
} from '@/lib/voiceCallRingtone'
import { useSession } from 'next-auth/react'
import { useVoiceCall, type VoiceCallState, type VoiceCallUser } from '@/hooks/useVoiceCall'
import { VoiceCallOverlay } from '@/components/VoiceCallOverlay'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { useUiLocale } from '@/hooks/useUiLocale'
import { talkChatIdx, talkChatTr } from '@/messages/talkChatStrings'

const TC = talkChatIdx

interface VoiceCallContextValue {
  callState: VoiceCallState
  callId: string | null
  remoteUser: VoiceCallUser | null
  startCall: (peer: VoiceCallUser, conversationId?: string | null) => Promise<void>
  answerCall: () => Promise<void>
  rejectCall: () => Promise<void>
  endCall: () => Promise<void>
  toggleMute: () => void
  toggleSpeaker: () => void
  isMuted: boolean
  isSpeakerOn: boolean
  lastError: string | null
  clearLastError: () => void
  remoteAudioRef: MutableRefObject<HTMLAudioElement | null>
  callUiHidden: boolean
  hideCallUi: () => void
  showCallUi: () => void
}

const VoiceCallContext = createContext<VoiceCallContextValue | null>(null)

function voiceCallDisplayName(user: VoiceCallUser | null) {
  if (!user) return '?'
  return (user.name || user.username || '').trim() || '?'
}

function formatVoiceCallAnnouncement(template: string, user: VoiceCallUser | null) {
  return template.replace('{name}', voiceCallDisplayName(user))
}

function useVoiceCallLabels() {
  const { localeTag } = useUiLocale()
  const tr = talkChatTr(localeTag)
  return {
    localeTag,
    appAudio: tr[TC.voiceAppAudio],
    incomingCall: tr[TC.voiceIncomingCall],
    calling: tr[TC.voiceCalling],
    connecting: tr[TC.voiceConnecting],
    connected: tr[TC.voiceConnected],
    accept: tr[TC.accept],
    decline: tr[TC.voiceDecline],
    endCall: tr[TC.voiceEndCall],
    mute: tr[TC.voiceMute],
    unmute: tr[TC.voiceUnmute],
    speaker: tr[TC.voiceSpeaker],
    video: tr[TC.voiceVideo],
    keypad: tr[TC.voiceKeypad],
    more: tr[TC.voiceMore],
    remindMe: tr[TC.voiceRemindMe],
    inAppHint: tr[TC.voiceCallInAppHint],
    hideCall: tr[TC.voiceHideCall],
    tapToShowCall: tr[TC.voiceTapToShowCall],
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
  const isDesktop = useIsDesktop()

  if (!session?.user || !ctx) return null

  const isActiveCall = ctx.callState !== 'idle' && ctx.callState !== 'ended'
  if (placement === 'embedded' && isDesktop) return null

  // iOS: CallKit owns incoming Accept/Decline (#2) — never show in-app incoming screen (#1).
  const iosCallKitIncoming =
    isNativeIosCallApp() && ctx.callState === 'incoming'

  const popupCallUi =
    placement === 'floating' && isActiveCall && isDesktop && !ctx.callUiHidden && !iosCallKitIncoming
  const fullscreenCallUi =
    placement === 'floating' && isActiveCall && !isDesktop && !ctx.callUiHidden && !iosCallKitIncoming
  const minimizedCallUi = placement === 'floating' && isActiveCall && ctx.callUiHidden
  const showCallControls = popupCallUi || fullscreenCallUi
  const canHideCall = isActiveCall
  const nativeVoiceCall = isNativeVoiceCallApp()

  return (
    <VoiceCallOverlay
      placement={placement}
      fullscreenCallUi={fullscreenCallUi}
      popupCallUi={popupCallUi}
      minimizedCallUi={minimizedCallUi}
      callState={ctx.callState}
      remoteUser={ctx.remoteUser}
      isMuted={ctx.isMuted}
      isSpeakerOn={ctx.isSpeakerOn}
      labels={labels}
      inAppHint={showCallControls ? undefined : labels.inAppHint}
      onHide={canHideCall ? ctx.hideCallUi : undefined}
      onRestoreCallUi={ctx.showCallUi}
      onAccept={() => {
        void (async () => {
          if (nativeVoiceCall && ctx.callId) {
            await answerNativeCall(ctx.callId).catch(() => false)
          }
          await ctx.answerCall()
        })()
      }}
      onReject={() => void ctx.rejectCall()}
      onEnd={() => void ctx.endCall()}
      onToggleMute={ctx.toggleMute}
      onToggleSpeaker={ctx.toggleSpeaker}
      speakerEnabled={nativeVoiceCall}
    />
  )
}

export function VoiceCallProvider({
  children,
}: {
  children: ReactNode
}) {
  const { data: session } = useSession()
  const [callUiHidden, setCallUiHidden] = useState(false)
  const hideCallUi = useCallback(() => setCallUiHidden(true), [])
  const showCallUi = useCallback(() => setCallUiHidden(false), [])

  const voiceCall = useVoiceCall({
    currentUserId: session?.user?.id,
    enabled: Boolean(session?.user),
  })
  const labels = useVoiceCallLabels()
  const callStateRef = useRef(voiceCall.callState)
  callStateRef.current = voiceCall.callState

  useEffect(() => {
    if (
      voiceCall.callState === 'idle' ||
      voiceCall.callState === 'ended' ||
      voiceCall.callState === 'incoming'
    ) {
      setCallUiHidden(false)
    }
  }, [voiceCall.callState, voiceCall.callId])

  useEffect(() => {
    installVoiceCallAudioUnlock()
  }, [])

  useEffect(() => {
    void bootstrapNativePush()
  }, [])

  useEffect(() => {
    if (!session?.user?.id) return
    if (isNativeCallApp()) {
      void subscribeNativePushIfNeeded()
      return
    }
    void registerVoiceCallPush()
    return installPushSubscriptionRefresh()
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

    // iOS CallKit owns lock-screen ring; in-app WAV when the WebView is visible (CallKit UI is dismissed).
    if (
      isNativeIosCallApp() &&
      state === 'incoming' &&
      typeof document !== 'undefined' &&
      document.hidden
    ) {
      return
    }
    // Avoid beep-only on lock screen: in-app ringtone needs a visible WebView; native layer shows UI.
    if (isNativeAndroidCallApp() && state === 'incoming' && typeof document !== 'undefined' && document.hidden) {
      return
    }

    const announcement =
      state === 'incoming'
        ? formatVoiceCallAnnouncement(labels.incomingCall, voiceCall.remoteUser)
        : formatVoiceCallAnnouncement(labels.calling, voiceCall.remoteUser)

    if (state === 'incoming') {
      startIncomingRingtone(announcement, labels.localeTag)
    } else {
      startOutgoingRingback(announcement, labels.localeTag)
    }
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
      // iOS incoming on lock screen uses CallKit; retry outgoing (and foreground incoming) ring.
      if (isNativeIosCallApp() && state === 'incoming' && document.hidden) return
      if (state === 'incoming' || state === 'outgoing') {
        retryVoiceCallRingtone()
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
        callId: voiceCall.callId,
        remoteUser: voiceCall.remoteUser,
        startCall: voiceCall.startCall,
        answerCall: async () => {
          await voiceCall.answerCall()
        },
        rejectCall: voiceCall.rejectCall,
        endCall: voiceCall.endCall,
        toggleMute: voiceCall.toggleMute,
        toggleSpeaker: voiceCall.toggleSpeaker,
        isMuted: voiceCall.isMuted,
        isSpeakerOn: voiceCall.isSpeakerOn,
        lastError: voiceCall.lastError,
        clearLastError: voiceCall.clearLastError,
        remoteAudioRef: voiceCall.remoteAudioRef,
        callUiHidden,
        hideCallUi,
        showCallUi,
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
      {session?.user &&
        voiceCall.callState !== 'idle' &&
        voiceCall.callState !== 'ended' && (
          <VoiceCallOverlayPanel placement="floating" />
        )}
    </VoiceCallContext.Provider>
  )
}

export function useVoiceCallContext() {
  return useContext(VoiceCallContext)
}
