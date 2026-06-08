'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { VoiceCallState, VoiceCallUser } from '@/hooks/useVoiceCall'

interface VoiceCallOverlayProps {
  callState: VoiceCallState
  remoteUser: VoiceCallUser | null
  isMuted: boolean
  labels: {
    appAudio: string
    incomingCall: string
    calling: string
    connecting: string
    connected: string
    accept: string
    decline: string
    endCall: string
    mute: string
    unmute: string
    speaker: string
    video: string
    keypad: string
    more: string
    remindMe: string
  }
  onAccept: () => void
  onReject: () => void
  onEnd: () => void
  onToggleMute: () => void
  /** floating = fixed on viewport; embedded = inside TalkChat panel */
  placement?: 'floating' | 'embedded'
  inAppHint?: string
  /** Full-screen call UI (incoming + active) when chat panel is closed */
  fullscreenCallUi?: boolean
}

function displayName(user: VoiceCallUser | null) {
  if (!user) return ''
  return (user.name || user.username || '').trim()
}

function formatCallStatus(template: string, user: VoiceCallUser | null) {
  const name = displayName(user) || '?'
  return template.replace('{name}', name)
}

function formatDuration(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function useCallDuration(active: boolean) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!active) {
      setSeconds(0)
      return
    }
    setSeconds(0)
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [active])

  return seconds
}

function CallBackdrop({ remoteUser }: { remoteUser: VoiceCallUser | null }) {
  return (
    <>
      {remoteUser?.avatar ? (
        <img
          src={remoteUser.avatar}
          alt=""
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(28px) brightness(0.45)',
            transform: 'scale(1.15)',
          }}
        />
      ) : null}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(61,41,20,0.92) 0%, rgba(26,18,8,0.95) 45%, rgba(13,9,6,0.98) 100%)',
        }}
      />
    </>
  )
}

function RoundCallButton({
  label,
  onClick,
  background,
  children,
  disabled = false,
}: {
  label: string
  onClick?: () => void
  background: string
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        border: 'none',
        background: 'transparent',
        color: 'white',
        cursor: disabled ? 'default' : 'pointer',
        padding: 0,
        minWidth: '88px',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <span
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </span>
      <span style={{ fontSize: '14px', fontWeight: 500 }}>{label}</span>
    </button>
  )
}

function IconX() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconBell() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7M13.73 21a2 2 0 01-3.46 0"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconSpeaker({ muted = false }: { muted?: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M11 5L6 9H3v6h3l5 4V5zM16 9a4 4 0 010 6M19 7a7 7 0 010 10"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={muted ? 0.5 : 1}
      />
      {muted ? (
        <path d="M4 4l16 16" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      ) : null}
    </svg>
  )
}

function IconVideo() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 10l4-2v8l-4-2V10zM5 8h8v8H5V8z"
        stroke="white"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconMic({ muted = false }: { muted?: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zM19 11a7 7 0 01-14 0M12 18v3"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {muted ? (
        <path d="M4 4l16 16" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      ) : null}
    </svg>
  )
}

function IconMore() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="white" aria-hidden>
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </svg>
  )
}

function IconPhoneEnd() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.07 21 3 13.93 3 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z"
        fill="white"
        transform="rotate(135 12 12)"
      />
    </svg>
  )
}

function IconKeypad() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      {[
        [7, 5],
        [12, 5],
        [17, 5],
        [7, 10],
        [12, 10],
        [17, 10],
        [7, 15],
        [12, 15],
        [17, 15],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" fill="white" />
      ))}
    </svg>
  )
}

function FullscreenShell({
  remoteUser,
  children,
}: {
  remoteUser: VoiceCallUser | null
  children: ReactNode
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <CallBackdrop remoteUser={remoteUser} />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding:
            'max(48px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function IncomingCallScreen({
  remoteUser,
  labels,
  onAccept,
  onReject,
}: {
  remoteUser: VoiceCallUser | null
  labels: VoiceCallOverlayProps['labels']
  onAccept: () => void
  onReject: () => void
}) {
  const name = displayName(remoteUser) || 'AiMediaTank'

  return (
    <FullscreenShell remoteUser={remoteUser}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          aria-label={labels.remindMe}
          title={labels.remindMe}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            border: 'none',
            background: 'transparent',
            color: 'white',
            cursor: 'pointer',
            padding: '4px',
            opacity: 0.85,
          }}
        >
          <IconBell />
          <span style={{ fontSize: '11px' }}>{labels.remindMe}</span>
        </button>
      </div>

      <div style={{ textAlign: 'center', opacity: 0.85, fontSize: '15px', marginTop: '4px' }}>
        {labels.appAudio}
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '0 16px',
        }}
      >
        {remoteUser?.avatar ? (
          <img
            src={remoteUser.avatar}
            alt=""
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              objectFit: 'cover',
              marginBottom: '8px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            }}
          />
        ) : null}
        <div
          style={{
            fontSize: '36px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            textAlign: 'center',
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: '16px', opacity: 0.75 }}>
          {formatCallStatus(labels.incomingCall, remoteUser)}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          gap: '56px',
          paddingBottom: '8px',
        }}
      >
        <RoundCallButton label={labels.decline} onClick={onReject} background="#ef4444">
          <IconX />
        </RoundCallButton>
        <RoundCallButton label={labels.accept} onClick={onAccept} background="#2563eb">
          <IconCheck />
        </RoundCallButton>
      </div>
    </FullscreenShell>
  )
}

function ActiveCallScreen({
  callState,
  remoteUser,
  isMuted,
  labels,
  onEnd,
  onToggleMute,
}: {
  callState: VoiceCallState
  remoteUser: VoiceCallUser | null
  isMuted: boolean
  labels: VoiceCallOverlayProps['labels']
  onEnd: () => void
  onToggleMute: () => void
}) {
  const name = displayName(remoteUser) || 'AiMediaTank'
  const connected = callState === 'connected'
  const duration = useCallDuration(connected)
  const statusLine =
    callState === 'outgoing'
      ? formatCallStatus(labels.calling, remoteUser)
      : callState === 'connecting'
        ? labels.connecting
        : `${labels.appAudio} - ${formatDuration(duration)}`

  return (
    <FullscreenShell remoteUser={remoteUser}>
      <div style={{ textAlign: 'center', opacity: 0.9, fontSize: '15px', marginTop: '8px' }}>
        {statusLine}
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '0 16px',
        }}
      >
        {remoteUser?.avatar ? (
          <img
            src={remoteUser.avatar}
            alt=""
            style={{
              width: '88px',
              height: '88px',
              borderRadius: '50%',
              objectFit: 'cover',
              marginBottom: '8px',
            }}
          />
        ) : null}
        <div
          style={{
            fontSize: '34px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            textAlign: 'center',
          }}
        >
          {name}
        </div>
        {callState === 'connected' ? (
          <div style={{ fontSize: '15px', opacity: 0.75 }}>{labels.connected}</div>
        ) : null}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          justifyItems: 'center',
          rowGap: '28px',
          columnGap: '8px',
          paddingBottom: '8px',
        }}
      >
        <RoundCallButton label={labels.speaker} background="rgba(255,255,255,0.18)" disabled>
          <IconSpeaker />
        </RoundCallButton>
        <RoundCallButton label={labels.video} background="rgba(255,255,255,0.18)" disabled>
          <IconVideo />
        </RoundCallButton>
        <RoundCallButton
          label={isMuted ? labels.unmute : labels.mute}
          onClick={onToggleMute}
          background={isMuted ? '#f59e0b' : 'rgba(255,255,255,0.18)'}
        >
          <IconMic muted={isMuted} />
        </RoundCallButton>
        <RoundCallButton label={labels.more} background="rgba(255,255,255,0.18)" disabled>
          <IconMore />
        </RoundCallButton>
        <RoundCallButton label={labels.endCall} onClick={onEnd} background="#ef4444">
          <IconPhoneEnd />
        </RoundCallButton>
        <RoundCallButton label={labels.keypad} background="rgba(255,255,255,0.18)" disabled>
          <IconKeypad />
        </RoundCallButton>
      </div>
    </FullscreenShell>
  )
}

function EmbeddedStatusBanner({
  callState,
  remoteUser,
  labels,
  inAppHint,
}: {
  callState: VoiceCallState
  remoteUser: VoiceCallUser | null
  labels: VoiceCallOverlayProps['labels']
  inAppHint?: string
}) {
  const statusLabel =
    callState === 'incoming'
      ? formatCallStatus(labels.incomingCall, remoteUser)
      : callState === 'outgoing'
        ? formatCallStatus(labels.calling, remoteUser)
        : callState === 'connecting'
          ? labels.connecting
          : labels.connected

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        flexShrink: 0,
        boxSizing: 'border-box',
        background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
        color: 'white',
        borderRadius: '0',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        borderTop: '2px solid #312e81',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {remoteUser?.avatar ? (
            <img
              src={remoteUser.avatar}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontWeight: 700, fontSize: '16px' }}>
              {displayName(remoteUser)[0]?.toUpperCase() || '?'}
            </span>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: '14px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayName(remoteUser)}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.85 }}>{statusLabel}</div>
        </div>
      </div>
      {inAppHint ? (
        <div style={{ fontSize: '11px', opacity: 0.8, lineHeight: 1.35 }}>{inAppHint}</div>
      ) : null}
    </div>
  )
}

export function VoiceCallOverlay({
  callState,
  remoteUser,
  isMuted,
  labels,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  placement = 'floating',
  inAppHint,
  fullscreenCallUi = false,
}: VoiceCallOverlayProps) {
  if (callState === 'idle' || callState === 'ended') return null

  if (placement === 'embedded') {
    return (
      <EmbeddedStatusBanner
        callState={callState}
        remoteUser={remoteUser}
        labels={labels}
        inAppHint={inAppHint}
      />
    )
  }

  if (fullscreenCallUi) {
    if (callState === 'incoming') {
      return (
        <IncomingCallScreen
          remoteUser={remoteUser}
          labels={labels}
          onAccept={onAccept}
          onReject={onReject}
        />
      )
    }

    return (
      <ActiveCallScreen
        callState={callState}
        remoteUser={remoteUser}
        isMuted={isMuted}
        labels={labels}
        onEnd={onEnd}
        onToggleMute={onToggleMute}
      />
    )
  }

  return (
    <EmbeddedStatusBanner
      callState={callState}
      remoteUser={remoteUser}
      labels={labels}
      inAppHint={inAppHint}
    />
  )
}
