'use client'

import type { MutableRefObject } from 'react'
import type { VoiceCallState, VoiceCallUser } from '@/hooks/useVoiceCall'

interface VoiceCallOverlayProps {
  callState: VoiceCallState
  remoteUser: VoiceCallUser | null
  isMuted: boolean
  remoteAudioRef: MutableRefObject<HTMLAudioElement | null>
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
}

function displayName(user: VoiceCallUser | null) {
  if (!user) return ''
  return (user.name || user.username || '').trim()
}

export function VoiceCallOverlay({
  callState,
  remoteUser,
  isMuted,
  remoteAudioRef,
  labels,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  placement = 'floating',
  inAppHint,
}: VoiceCallOverlayProps) {
  if (callState === 'idle' || callState === 'ended') return null

  const statusLabel =
    callState === 'incoming'
      ? labels.incomingCall
      : callState === 'outgoing'
        ? labels.calling
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
      <audio ref={(el) => { remoteAudioRef.current = el }} autoPlay playsInline />

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
