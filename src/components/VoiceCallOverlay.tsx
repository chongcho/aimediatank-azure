'use client'

import type { ReactNode } from 'react'
import type { VoiceCallState, VoiceCallUser } from '@/hooks/useVoiceCall'

interface VoiceCallOverlayProps {
  callState: VoiceCallState
  remoteUser: VoiceCallUser | null
  isMuted: boolean
  labels: {
    incomingCall: string
    calling: string
    connecting: string
    connected: string
    accept: string
    reject: string
    endCall: string
    mute: string
    unmute: string
  }
  onAccept: () => void
  onReject: () => void
  onEnd: () => void
  onToggleMute: () => void
  /** floating = fixed on viewport; embedded = inside TalkChat panel */
  placement?: 'floating' | 'embedded'
  inAppHint?: string
  /** Native iOS: full-screen CallKit-style incoming UI with green Accept phone button */
  nativeIncomingFullscreen?: boolean
}

function displayName(user: VoiceCallUser | null) {
  if (!user) return ''
  return (user.name || user.username || '').trim()
}

function formatCallStatus(template: string, user: VoiceCallUser | null) {
  const name = displayName(user) || '?'
  return template.replace('{name}', name)
}

function PhoneHandsetIcon({ color = 'white' }: { color?: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.07 21 3 13.93 3 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z"
        fill={color}
      />
    </svg>
  )
}

function CallControlButton({
  label,
  onClick,
  background,
  children,
}: {
  label: string
  onClick: () => void
  background: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        border: 'none',
        background: 'transparent',
        color: 'white',
        cursor: 'pointer',
        padding: 0,
        minWidth: '72px',
      }}
    >
      <span
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </span>
      <span style={{ fontSize: '13px', fontWeight: 500 }}>{label}</span>
    </button>
  )
}

function NativeIncomingCallScreen({
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'linear-gradient(180deg, #3d2914 0%, #1a1208 45%, #0d0906 100%)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        padding: 'max(48px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom))',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ textAlign: 'center', opacity: 0.85, fontSize: '15px', marginTop: '8px' }}>
        AiMediaTank Audio
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
            }}
          />
        ) : null}
        <div style={{ fontSize: '36px', fontWeight: 700, letterSpacing: '-0.02em', textAlign: 'center' }}>
          {name}
        </div>
        <div style={{ fontSize: '16px', opacity: 0.75 }}>{labels.incomingCall.replace('{name}', name)}</div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          alignItems: 'end',
          justifyItems: 'center',
          gap: '8px',
          paddingBottom: '8px',
        }}
      >
        <CallControlButton label={labels.accept} onClick={onAccept} background="#22c55e">
          <PhoneHandsetIcon />
        </CallControlButton>
        <CallControlButton label={labels.reject} onClick={onReject} background="#ef4444">
          <PhoneHandsetIcon />
        </CallControlButton>
        <div style={{ width: '72px' }} aria-hidden />
      </div>
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
  nativeIncomingFullscreen = false,
}: VoiceCallOverlayProps) {
  if (callState === 'idle' || callState === 'ended') return null

  if (nativeIncomingFullscreen && callState === 'incoming') {
    return (
      <NativeIncomingCallScreen
        remoteUser={remoteUser}
        labels={labels}
        onAccept={onAccept}
        onReject={onReject}
      />
    )
  }

  const statusLabel =
    callState === 'incoming'
      ? formatCallStatus(labels.incomingCall, remoteUser)
      : callState === 'outgoing'
        ? formatCallStatus(labels.calling, remoteUser)
        : callState === 'connecting'
          ? labels.connecting
          : labels.connected

  const embedded = placement === 'embedded'

  return (
    <div
      style={{
        ...(embedded
          ? {
              position: 'relative',
              width: '100%',
              flexShrink: 0,
              boxSizing: 'border-box',
            }
          : {
              position: 'fixed',
              bottom: '88px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 10050,
              minWidth: '260px',
              maxWidth: '90vw',
            }),
        background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
        color: 'white',
        borderRadius: embedded ? '0' : '12px',
        padding: '12px 16px',
        boxShadow: embedded ? 'none' : '0 8px 32px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        border: embedded ? 'none' : '1px solid rgba(255,255,255,0.15)',
        borderTop: embedded ? '2px solid #312e81' : undefined,
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
          <div style={{ fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayName(remoteUser)}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.85 }}>{statusLabel}</div>
        </div>
      </div>

      {inAppHint && (
        <div style={{ fontSize: '11px', opacity: 0.8, lineHeight: 1.35 }}>{inAppHint}</div>
      )}

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
        {callState === 'incoming' ? (
          <>
            <button
              type="button"
              onClick={onAccept}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: 'none',
                background: '#22c55e',
                color: 'white',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              {labels.accept}
            </button>
            <button
              type="button"
              onClick={onReject}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: 'none',
                background: '#ef4444',
                color: 'white',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              {labels.reject}
            </button>
          </>
        ) : (
          <>
            {(callState === 'connected' || callState === 'connecting') && (
              <button
                type="button"
                onClick={onToggleMute}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isMuted ? '#f59e0b' : 'rgba(255,255,255,0.2)',
                  color: 'white',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                {isMuted ? labels.unmute : labels.mute}
              </button>
            )}
            <button
              type="button"
              onClick={onEnd}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: 'none',
                background: '#ef4444',
                color: 'white',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              {labels.endCall}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
