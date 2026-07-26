'use client'

import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { VoiceCallState, VoiceCallUser } from '@/hooks/useVoiceCall'
import { voiceCallNickname } from '@/hooks/useVoiceCall'
import type { VoiceCallRingtoneId } from '@/lib/voiceCallVolume'

const CALL_POPUP_DEFAULT = { width: 360, height: 420 }
const CALL_POPUP_VIDEO_DEFAULT = { width: 560, height: 560 }
const CALL_POPUP_MIN = { width: 320, height: 360 }
const CALL_POPUP_Z_INDEX = 100050
/** Above navbar (100010) and TalkChat so the call UI covers the screen on mobile. */
const FULLSCREEN_CALL_Z_INDEX = 100050
const MINIMIZED_CALL_Z_INDEX = 100050
const POPUP_SIZE_STORAGE_KEY = 'voiceCallPopupSize'
const POPUP_POS_STORAGE_KEY = 'voiceCallPopupPosition'

/** Matches CallBackdrop so portal mount delay never flashes the home feed. */
const CALL_UI_VEIL_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: FULLSCREEN_CALL_Z_INDEX,
  background: 'linear-gradient(180deg, #3d2914 0%, #1a1208 45%, #0d0906 100%)',
  pointerEvents: 'none',
}

interface VoiceCallOverlayProps {
  callState: VoiceCallState
  remoteUser: VoiceCallUser | null
  isMuted: boolean
  isSpeakerOn: boolean
  hasVideo?: boolean
  isCameraOff?: boolean
  nativeOwnsVideo?: boolean
  localVideoRef?: MutableRefObject<HTMLVideoElement | null>
  remoteVideoRef?: MutableRefObject<HTMLVideoElement | null>
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
    hideCall: string
    tapToShowCall: string
    ringtone: string
    ringtoneIncoming: string
    ringtoneOutgoing: string
  }
  ringtoneId: VoiceCallRingtoneId
  onRingtoneChange: (id: VoiceCallRingtoneId) => void
  onAccept: () => void
  onReject: () => void
  onEnd: () => void
  onToggleMute: () => void
  onToggleCamera?: () => void
  onToggleSpeaker: () => void
  speakerEnabled?: boolean
  onHide?: () => void
  onRestoreCallUi?: () => void
  /** floating = fixed on viewport; embedded = inside TalkChat panel */
  placement?: 'floating' | 'embedded'
  inAppHint?: string
  /** Full-screen call UI on mobile when chat panel is closed */
  fullscreenCallUi?: boolean
  /** Draggable call popup on desktop (TalkChat-style) */
  popupCallUi?: boolean
  /** Compact top bar when call controls are hidden */
  minimizedCallUi?: boolean
}

type CallUiMode = 'fullscreen' | 'popup'

function displayName(user: VoiceCallUser | null) {
  return voiceCallNickname(user)
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
  compact = false,
  showLabel = true,
}: {
  label: string
  onClick?: () => void
  background: string
  children: ReactNode
  disabled?: boolean
  compact?: boolean
  showLabel?: boolean
}) {
  const btnSize = compact ? 56 : 72
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
        gap: showLabel ? (compact ? '6px' : '10px') : 0,
        border: 'none',
        background: 'transparent',
        color: 'white',
        cursor: disabled ? 'default' : 'pointer',
        padding: 0,
        minWidth: showLabel ? (compact ? '72px' : '88px') : `${btnSize}px`,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <span
        style={{
          width: `${btnSize}px`,
          height: `${btnSize}px`,
          borderRadius: '50%',
          background,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </span>
      {showLabel ? (
        <span style={{ fontSize: compact ? '12px' : '14px', fontWeight: 500 }}>{label}</span>
      ) : null}
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

function IconChevronDown() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function HideCallButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        border: 'none',
        background: 'rgba(255,255,255,0.12)',
        color: 'white',
        cursor: 'pointer',
        padding: '8px 12px',
        borderRadius: '20px',
        fontSize: '13px',
        fontWeight: 600,
      }}
    >
      <IconChevronDown />
      <span>{label}</span>
    </button>
  )
}

/** Ringtone picker only — call/ring volume sliders removed (use hardware keys). */
function RingtoneControls({
  ringtoneId,
  onRingtoneChange,
  labels,
  compact = false,
}: {
  ringtoneId: VoiceCallRingtoneId
  onRingtoneChange: (id: VoiceCallRingtoneId) => void
  labels: VoiceCallOverlayProps['labels']
  compact?: boolean
}) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: compact ? '280px' : '340px',
        margin: compact ? '12px auto 0' : '20px auto 8px',
        padding: compact ? '12px 14px' : '14px 16px',
        borderRadius: '16px',
        background: 'rgba(0,0,0,0.28)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxSizing: 'border-box',
      }}
    >
      <label
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          fontSize: compact ? '12px' : '13px',
          fontWeight: 600,
        }}
      >
        <span>{labels.ringtone}</span>
        <select
          value={ringtoneId}
          onChange={(e) => onRingtoneChange(e.target.value as VoiceCallRingtoneId)}
          style={{
            width: '100%',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.18)',
            background: 'rgba(255,255,255,0.1)',
            color: 'white',
            padding: '8px 10px',
            fontSize: compact ? '12px' : '13px',
          }}
        >
          <option value="incoming">{labels.ringtoneIncoming}</option>
          <option value="outgoing">{labels.ringtoneOutgoing}</option>
        </select>
      </label>
    </div>
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

function getDesktopNavbarBottom(): number {
  // Match TalkChat pickup window — desktop navbar is h-16 (4rem).
  const FALLBACK = 64
  if (typeof document === 'undefined') return FALLBACK
  const nav = document.querySelector('.pwa-navbar')
  if (nav instanceof HTMLElement) {
    const bottom = nav.getBoundingClientRect().bottom
    if (Number.isFinite(bottom) && bottom > 0) return bottom
  }
  return FALLBACK
}

function defaultPopupPosition(width = CALL_POPUP_DEFAULT.width) {
  if (typeof window === 'undefined') return { x: 24, y: 64 }
  const minY = getDesktopNavbarBottom()
  return {
    x: Math.max(24, window.innerWidth - width - 24),
    y: minY + 8,
  }
}

function clampPopupSize(width: number, height: number, topY?: number) {
  if (typeof window === 'undefined') {
    return {
      width: Math.max(CALL_POPUP_MIN.width, width),
      height: Math.max(CALL_POPUP_MIN.height, height),
    }
  }
  const minY = topY ?? getDesktopNavbarBottom()
  const maxW = Math.max(CALL_POPUP_MIN.width, window.innerWidth - 48)
  const maxH = Math.max(CALL_POPUP_MIN.height, window.innerHeight - minY - 24)
  return {
    width: Math.min(maxW, Math.max(CALL_POPUP_MIN.width, width)),
    height: Math.min(maxH, Math.max(CALL_POPUP_MIN.height, height)),
  }
}

function clampCallPopupPosition(x: number, y: number, width: number, height: number) {
  if (typeof window === 'undefined') return { x, y }
  const minY = getDesktopNavbarBottom()
  const maxX = Math.max(0, window.innerWidth - width)
  const maxY = Math.max(minY, window.innerHeight - height)
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(minY, Math.min(y, maxY)),
  }
}

function CallPopupShell({
  remoteUser,
  title,
  children,
  onHide,
  hideLabel,
  hasVideo = false,
}: {
  remoteUser: VoiceCallUser | null
  title: string
  children: ReactNode
  onHide?: () => void
  hideLabel?: string
  hasVideo?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const defaultSize = hasVideo ? CALL_POPUP_VIDEO_DEFAULT : CALL_POPUP_DEFAULT
  const [size, setSize] = useState(defaultSize)
  const [position, setPosition] = useState(() => defaultPopupPosition(defaultSize.width))
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [hasCustomPosition, setHasCustomPosition] = useState(false)
  const [hasCustomSize, setHasCustomSize] = useState(false)
  const [resizeEdge, setResizeEdge] = useState<
    'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null
  >(null)
  const resizeStartRef = useRef({
    mouseX: 0,
    mouseY: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
  })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const savedPos = localStorage.getItem(POPUP_POS_STORAGE_KEY)
    const savedSize = localStorage.getItem(POPUP_SIZE_STORAGE_KEY)
    let nextSize = hasVideo ? CALL_POPUP_VIDEO_DEFAULT : CALL_POPUP_DEFAULT
    if (savedSize) {
      try {
        const parsed = JSON.parse(savedSize) as { width?: number; height?: number }
        if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
          nextSize = clampPopupSize(parsed.width, parsed.height)
          setHasCustomSize(true)
        }
      } catch {
        // ignore
      }
    }
    setSize(nextSize)
    if (savedPos) {
      try {
        const pos = JSON.parse(savedPos) as { x: number; y: number }
        setPosition(clampCallPopupPosition(pos.x, pos.y, nextSize.width, nextSize.height))
        setHasCustomPosition(true)
      } catch {
        // ignore invalid saved position
      }
    } else {
      setPosition(defaultPopupPosition(nextSize.width))
    }
    // Initial layout only — don't reset when hasVideo flips mid-call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hasCustomPosition) return
    localStorage.setItem(POPUP_POS_STORAGE_KEY, JSON.stringify(position))
  }, [position, hasCustomPosition])

  useEffect(() => {
    if (!hasCustomSize) return
    localStorage.setItem(POPUP_SIZE_STORAGE_KEY, JSON.stringify(size))
  }, [size, hasCustomSize])

  useEffect(() => {
    const handleWindowResize = () => {
      setSize((prev) => {
        const next = clampPopupSize(prev.width, prev.height)
        setPosition((pos) => clampCallPopupPosition(pos.x, pos.y, next.width, next.height))
        return next
      })
    }
    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [])

  const handleDragStart = (e: React.MouseEvent) => {
    if (resizeEdge) return
    e.preventDefault()
    setIsDragging(true)
    setHasCustomPosition(true)
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
  }

  const handleResetLayout = () => {
    const next = hasVideo ? CALL_POPUP_VIDEO_DEFAULT : CALL_POPUP_DEFAULT
    const sized = clampPopupSize(next.width, next.height)
    setSize(sized)
    setPosition(defaultPopupPosition(sized.width))
    setHasCustomPosition(false)
    setHasCustomSize(false)
    localStorage.removeItem(POPUP_POS_STORAGE_KEY)
    localStorage.removeItem(POPUP_SIZE_STORAGE_KEY)
  }

  const beginResize = (edge: NonNullable<typeof resizeEdge>) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setResizeEdge(edge)
    setHasCustomSize(true)
    setHasCustomPosition(true)
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      width: size.width,
      height: size.height,
      x: position.x,
      y: position.y,
    }
  }

  useEffect(() => {
    if (!isDragging) return
    const handleMove = (e: MouseEvent) => {
      setPosition(
        clampCallPopupPosition(
          e.clientX - dragOffset.x,
          e.clientY - dragOffset.y,
          size.width,
          size.height,
        ),
      )
    }
    const handleUp = () => setIsDragging(false)
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [isDragging, dragOffset, size.width, size.height])

  useEffect(() => {
    if (!resizeEdge) return
    const handleMove = (e: MouseEvent) => {
      const start = resizeStartRef.current
      const dx = e.clientX - start.mouseX
      const dy = e.clientY - start.mouseY
      let nextW = start.width
      let nextH = start.height
      let nextX = start.x
      let nextY = start.y
      const minY = getDesktopNavbarBottom()

      if (resizeEdge.includes('e')) nextW = start.width + dx
      if (resizeEdge.includes('w')) {
        nextW = start.width - dx
        nextX = start.x + dx
      }
      if (resizeEdge.includes('s')) nextH = start.height + dy
      if (resizeEdge.includes('n')) {
        nextH = start.height - dy
        nextY = start.y + dy
        // Do not drag the top edge above the navbar.
        if (nextY < minY) {
          nextH -= minY - nextY
          nextY = minY
        }
      }

      const clamped = clampPopupSize(nextW, nextH, nextY)
      if (resizeEdge.includes('w')) {
        nextX = start.x + (start.width - clamped.width)
      }
      if (resizeEdge.includes('n')) {
        nextY = start.y + (start.height - clamped.height)
        if (nextY < minY) nextY = minY
      }
      setSize(clamped)
      setPosition(clampCallPopupPosition(nextX, nextY, clamped.width, clamped.height))
    }
    const handleUp = () => setResizeEdge(null)
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [resizeEdge])

  if (!mounted) return null

  const edgeHit = 6
  const cornerHit = 12

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x,
        width: size.width,
        height: size.height,
        zIndex: CALL_POPUP_Z_INDEX,
        color: 'white',
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <CallBackdrop remoteUser={remoteUser} />
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            onMouseDown={handleDragStart}
            onDoubleClick={handleResetLayout}
            title="Drag to move · drag edges to resize · double-click to reset"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(0,0,0,0.2)',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, opacity: 0.9 }}>{title}</span>
            {onHide && hideLabel ? (
              <button
                type="button"
                onClick={onHide}
                aria-label={hideLabel}
                title={hideLabel}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  border: 'none',
                  background: 'rgba(255,255,255,0.15)',
                  color: 'white',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                <IconChevronDown />
                {hideLabel}
              </button>
            ) : (
              <span style={{ fontSize: '11px', opacity: 0.55 }}>⋮⋮</span>
            )}
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              padding: '16px 18px 20px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {children}
          </div>
        </div>
      </div>

      {/* Resize edges */}
      <div
        onMouseDown={beginResize('w')}
        style={{ position: 'absolute', left: 0, top: 0, width: edgeHit, height: '100%', cursor: 'ew-resize', zIndex: 3 }}
        title="Resize"
      />
      <div
        onMouseDown={beginResize('e')}
        style={{ position: 'absolute', right: 0, top: 0, width: edgeHit, height: '100%', cursor: 'ew-resize', zIndex: 3 }}
        title="Resize"
      />
      <div
        onMouseDown={beginResize('n')}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: edgeHit, cursor: 'ns-resize', zIndex: 3 }}
        title="Resize"
      />
      <div
        onMouseDown={beginResize('s')}
        style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: edgeHit, cursor: 'ns-resize', zIndex: 3 }}
        title="Resize"
      />
      <div
        onMouseDown={beginResize('nw')}
        style={{ position: 'absolute', left: 0, top: 0, width: cornerHit, height: cornerHit, cursor: 'nwse-resize', zIndex: 4 }}
      />
      <div
        onMouseDown={beginResize('ne')}
        style={{ position: 'absolute', right: 0, top: 0, width: cornerHit, height: cornerHit, cursor: 'nesw-resize', zIndex: 4 }}
      />
      <div
        onMouseDown={beginResize('sw')}
        style={{ position: 'absolute', left: 0, bottom: 0, width: cornerHit, height: cornerHit, cursor: 'nesw-resize', zIndex: 4 }}
      />
      <div
        onMouseDown={beginResize('se')}
        style={{
          position: 'absolute',
          right: 2,
          bottom: 2,
          width: cornerHit,
          height: cornerHit,
          cursor: 'nwse-resize',
          zIndex: 4,
          borderRight: '2px solid rgba(255,255,255,0.35)',
          borderBottom: '2px solid rgba(255,255,255,0.35)',
          borderRadius: '0 0 4px 0',
        }}
        title="Drag to resize"
      />
    </div>,
    document.body,
  )
}

function FullscreenShell({
  remoteUser,
  children,
}: {
  remoteUser: VoiceCallUser | null
  children: ReactNode
}) {
  // Capacitor is always client — mount portal immediately (no null/veil frame → home flash).
  const [mounted, setMounted] = useState(() => typeof document !== 'undefined')

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div style={CALL_UI_VEIL_STYLE} aria-hidden />
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: FULLSCREEN_CALL_Z_INDEX,
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
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          padding:
            'max(48px, env(safe-area-inset-top)) 16px max(12px, env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

function CallScreenShell({
  mode,
  remoteUser,
  title,
  children,
  onHide,
  hideLabel,
  hasVideo = false,
}: {
  mode: CallUiMode
  remoteUser: VoiceCallUser | null
  title: string
  children: ReactNode
  onHide?: () => void
  hideLabel?: string
  hasVideo?: boolean
}) {
  if (mode === 'popup') {
    return (
      <CallPopupShell
        remoteUser={remoteUser}
        title={title}
        onHide={onHide}
        hideLabel={hideLabel}
        hasVideo={hasVideo}
      >
        {children}
      </CallPopupShell>
    )
  }
  return (
    <FullscreenShell remoteUser={remoteUser}>
      {onHide && hideLabel ? (
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '8px' }}>
          <HideCallButton label={hideLabel} onClick={onHide} />
        </div>
      ) : null}
      {children}
    </FullscreenShell>
  )
}

function IncomingCallScreen({
  remoteUser,
  labels,
  onAccept,
  onReject,
  onHide,
  ringtoneId,
  onRingtoneChange,
  mode = 'fullscreen',
}: {
  remoteUser: VoiceCallUser | null
  labels: VoiceCallOverlayProps['labels']
  onAccept: () => void
  onReject: () => void
  onHide?: () => void
  ringtoneId: VoiceCallRingtoneId
  onRingtoneChange: (id: VoiceCallRingtoneId) => void
  mode?: CallUiMode
}) {
  const name = displayName(remoteUser) || 'AiMediaTank'
  const compact = mode === 'popup'
  const popupTitle = formatCallStatus(labels.incomingCall, remoteUser)

  return (
    <CallScreenShell
      mode={mode}
      remoteUser={remoteUser}
      title={compact ? popupTitle : labels.appAudio}
      onHide={onHide}
      hideLabel={onHide ? labels.hideCall : undefined}
    >

      {mode === 'fullscreen' ? (
        <div style={{ textAlign: 'center', opacity: 0.85, fontSize: '15px', marginTop: '4px' }}>
          {labels.appAudio}
        </div>
      ) : null}

      <div
        style={{
          flex: mode === 'fullscreen' ? 1 : undefined,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: compact ? '8px' : '12px',
          padding: mode === 'fullscreen' ? '0 16px' : '8px 0 16px',
          textAlign: 'center',
        }}
      >
        {remoteUser?.avatar ? (
          <img
            src={remoteUser.avatar}
            alt=""
            style={{
              width: compact ? '72px' : '96px',
              height: compact ? '72px' : '96px',
              borderRadius: '50%',
              objectFit: 'cover',
              marginBottom: compact ? '4px' : '8px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            }}
          />
        ) : null}
        <div
          style={{
            fontSize: compact ? '26px' : '36px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: compact ? '14px' : '16px', opacity: 0.75 }}>
          {formatCallStatus(labels.incomingCall, remoteUser)}
        </div>
        <RingtoneControls
          ringtoneId={ringtoneId}
          onRingtoneChange={onRingtoneChange}
          labels={labels}
          compact={compact}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          gap: compact ? '40px' : '56px',
          paddingBottom: mode === 'fullscreen' ? '8px' : 0,
        }}
      >
        <RoundCallButton
          label={labels.decline}
          onClick={onReject}
          background="#ef4444"
          compact={compact}
        >
          <IconX />
        </RoundCallButton>
        <RoundCallButton
          label={labels.accept}
          onClick={onAccept}
          background="#2563eb"
          compact={compact}
        >
          <IconCheck />
        </RoundCallButton>
      </div>
    </CallScreenShell>
  )
}

function ActiveCallScreen({
  callState,
  remoteUser,
  isMuted,
  isSpeakerOn,
  hasVideo = false,
  isCameraOff = false,
  nativeOwnsVideo = false,
  localVideoRef,
  remoteVideoRef,
  labels,
  onEnd,
  onToggleMute,
  onToggleCamera,
  onToggleSpeaker,
  speakerEnabled = false,
  onHide,
  ringtoneId,
  onRingtoneChange,
  mode = 'fullscreen',
}: {
  callState: VoiceCallState
  remoteUser: VoiceCallUser | null
  isMuted: boolean
  isSpeakerOn: boolean
  hasVideo?: boolean
  isCameraOff?: boolean
  nativeOwnsVideo?: boolean
  localVideoRef?: MutableRefObject<HTMLVideoElement | null>
  remoteVideoRef?: MutableRefObject<HTMLVideoElement | null>
  labels: VoiceCallOverlayProps['labels']
  onEnd: () => void
  onToggleMute: () => void
  onToggleCamera?: () => void
  onToggleSpeaker: () => void
  speakerEnabled?: boolean
  onHide?: () => void
  ringtoneId: VoiceCallRingtoneId
  onRingtoneChange: (id: VoiceCallRingtoneId) => void
  mode?: CallUiMode
}) {
  const name = displayName(remoteUser) || 'AiMediaTank'
  const connected = callState === 'connected'
  const duration = useCallDuration(connected)
  const compact = mode === 'popup'
  const statusText =
    callState === 'outgoing'
      ? formatCallStatus(labels.calling, remoteUser)
      : callState === 'connecting'
        ? labels.connecting
        : connected
          ? labels.connected
          : labels.connecting
  const statusLine =
    callState === 'outgoing'
      ? formatCallStatus(labels.calling, remoteUser)
      : callState === 'connecting'
        ? labels.connecting
        : `${hasVideo ? 'AiMediaTank Video' : labels.appAudio} - ${formatDuration(duration)}`

  // Android-aligned video UI: edge-to-edge remote, PiP top-right, black footer (Speaker / End / Mute).
  if (hasVideo && mode === 'fullscreen' && !nativeOwnsVideo) {
    if (typeof document === 'undefined') return null
    return createPortal(
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: FULLSCREEN_CALL_Z_INDEX,
          background: '#0a0a0a',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: '#111' }}>
          <video
            ref={(el) => {
              if (remoteVideoRef) remoteVideoRef.current = el
            }}
            autoPlay
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#111' }}
          />
          <video
            ref={(el) => {
              if (localVideoRef) localVideoRef.current = el
            }}
            autoPlay
            muted
            playsInline
            style={{
              position: 'absolute',
              top: 'max(12px, env(safe-area-inset-top))',
              right: 16,
              width: 100,
              height: 140,
              objectFit: 'cover',
              borderRadius: 0,
              background: '#222',
              transform: 'scaleX(-1)',
              opacity: isCameraOff ? 0.35 : 1,
            }}
          />
        </div>
        <div
          style={{
            marginTop: 'auto',
            position: 'relative',
            zIndex: 2,
            background: '#000',
            padding:
              '16px 24px max(20px, calc(12px + env(safe-area-inset-bottom)))',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            {name}
          </div>
          <div style={{ fontSize: 15, opacity: 0.78, marginTop: 6, marginBottom: 16 }}>{statusText}</div>
          <div
            style={{
              display: 'flex',
              width: '100%',
              maxWidth: 360,
              justifyContent: 'space-around',
              alignItems: 'center',
            }}
          >
            <RoundCallButton
              label={labels.speaker}
              onClick={onToggleSpeaker}
              background={isSpeakerOn ? '#2563eb' : 'rgba(255,255,255,0.22)'}
              disabled={!speakerEnabled}
              compact
              showLabel={false}
            >
              <IconSpeaker muted={!isSpeakerOn} />
            </RoundCallButton>
            <RoundCallButton
              label={labels.endCall}
              onClick={onEnd}
              background="#ef4444"
              compact
              showLabel={false}
            >
              <IconPhoneEnd />
            </RoundCallButton>
            <RoundCallButton
              label={isMuted ? labels.unmute : labels.mute}
              onClick={onToggleMute}
              background={isMuted ? '#f59e0b' : 'rgba(255,255,255,0.22)'}
              compact
              showLabel={false}
            >
              <IconMic muted={isMuted} />
            </RoundCallButton>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  return (
    <CallScreenShell
      mode={mode}
      remoteUser={remoteUser}
      title={statusLine}
      onHide={onHide}
      hideLabel={onHide ? labels.hideCall : undefined}
      hasVideo={hasVideo}
    >
      {mode === 'fullscreen' ? (
        <div style={{ textAlign: 'center', opacity: 0.9, fontSize: '15px', marginTop: '8px', flexShrink: 0 }}>
          {statusLine}
        </div>
      ) : null}

      <div
        style={{
          flex: mode === 'fullscreen' || hasVideo ? '1 1 0' : undefined,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: hasVideo ? 'flex-start' : 'center',
          gap: compact ? '8px' : '12px',
          padding: mode === 'fullscreen' ? '0 16px' : '8px 0 12px',
          textAlign: 'center',
          minHeight: 0,
          width: '100%',
          overflow: 'hidden',
          height: mode === 'popup' && hasVideo ? '100%' : undefined,
        }}
      >
        {hasVideo ? (
          <div
            style={{
              position: 'relative',
              width: '100%',
              flex: '1 1 0',
              minHeight: compact ? 160 : 160,
              maxHeight: mode === 'fullscreen' ? '48dvh' : undefined,
              borderRadius: compact ? 12 : 16,
              overflow: 'hidden',
              background: nativeOwnsVideo ? 'transparent' : '#0d0906',
              marginBottom: compact ? 8 : 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {nativeOwnsVideo ? (
              remoteUser?.avatar ? (
                <img
                  src={remoteUser.avatar}
                  alt=""
                  style={{
                    width: compact ? 96 : 128,
                    height: compact ? 96 : 128,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    opacity: 0.85,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: compact ? 96 : 128,
                    height: compact ? 96 : 128,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.12)',
                  }}
                />
              )
            ) : (
              <>
            <video
              ref={(el) => {
                if (remoteVideoRef) remoteVideoRef.current = el
              }}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                background: '#111',
              }}
            />
            <video
              ref={(el) => {
                if (localVideoRef) localVideoRef.current = el
              }}
              autoPlay
              muted
              playsInline
              style={{
                position: 'absolute',
                right: 12,
                top: 12,
                width: compact ? 88 : 112,
                height: compact ? 118 : 150,
                objectFit: 'cover',
                borderRadius: 10,
                border: '2px solid rgba(255,255,255,0.35)',
                background: '#222',
                transform: 'scaleX(-1)',
                opacity: isCameraOff ? 0.35 : 1,
              }}
            />
              </>
            )}
          </div>
        ) : remoteUser?.avatar ? (
          <img
            src={remoteUser.avatar}
            alt=""
            style={{
              width: compact ? '64px' : '88px',
              height: compact ? '64px' : '88px',
              borderRadius: '50%',
              objectFit: 'cover',
              marginBottom: compact ? '4px' : '8px',
              flexShrink: 0,
            }}
          />
        ) : null}
        <div
          style={{
            fontSize: compact ? '24px' : '34px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            flexShrink: 0,
          }}
        >
          {name}
        </div>
        {callState === 'connected' ? (
          <div style={{ fontSize: compact ? '13px' : '15px', opacity: 0.75, flexShrink: 0 }}>
            {labels.connected}
          </div>
        ) : null}
        {callState === 'outgoing' && !hasVideo ? (
          <RingtoneControls
            ringtoneId={ringtoneId}
            onRingtoneChange={onRingtoneChange}
            labels={labels}
            compact={compact}
          />
        ) : null}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          justifyItems: 'center',
          rowGap: compact ? '16px' : '20px',
          columnGap: '4px',
          paddingTop: compact ? 8 : 12,
          paddingBottom: mode === 'fullscreen' ? 8 : 0,
          flexShrink: 0,
          width: '100%',
        }}
      >
        <RoundCallButton
          label={labels.speaker}
          onClick={onToggleSpeaker}
          background={isSpeakerOn ? '#2563eb' : 'rgba(255,255,255,0.18)'}
          disabled={!speakerEnabled}
          compact={compact}
        >
          <IconSpeaker muted={!isSpeakerOn} />
        </RoundCallButton>
        {hasVideo ? (
          <RoundCallButton
            label={labels.endCall}
            onClick={onEnd}
            background="#ef4444"
            compact={compact}
          >
            <IconPhoneEnd />
          </RoundCallButton>
        ) : (
          <RoundCallButton
            label={labels.video}
            onClick={onToggleCamera}
            background={hasVideo && !isCameraOff ? '#2563eb' : 'rgba(255,255,255,0.18)'}
            disabled={!hasVideo || !onToggleCamera}
            compact={compact}
          >
            <IconVideo />
          </RoundCallButton>
        )}
        <RoundCallButton
          label={isMuted ? labels.unmute : labels.mute}
          onClick={onToggleMute}
          background={isMuted ? '#f59e0b' : 'rgba(255,255,255,0.18)'}
          compact={compact}
        >
          <IconMic muted={isMuted} />
        </RoundCallButton>
        {!hasVideo ? (
          <>
            <RoundCallButton
              label={labels.more}
              background="rgba(255,255,255,0.18)"
              disabled
              compact={compact}
            >
              <IconMore />
            </RoundCallButton>
            <RoundCallButton
              label={labels.endCall}
              onClick={onEnd}
              background="#ef4444"
              compact={compact}
            >
              <IconPhoneEnd />
            </RoundCallButton>
            <RoundCallButton
              label={labels.keypad}
              background="rgba(255,255,255,0.18)"
              disabled
              compact={compact}
            >
              <IconKeypad />
            </RoundCallButton>
          </>
        ) : null}
      </div>
    </CallScreenShell>
  )
}

function FloatingMinimizedCallBar({
  callState,
  remoteUser,
  labels,
  onRestore,
}: {
  callState: VoiceCallState
  remoteUser: VoiceCallUser | null
  labels: VoiceCallOverlayProps['labels']
  onRestore: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const connected = callState === 'connected'
  const duration = useCallDuration(connected)
  const statusLabel =
    callState === 'incoming'
      ? formatCallStatus(labels.incomingCall, remoteUser)
      : callState === 'outgoing'
        ? formatCallStatus(labels.calling, remoteUser)
        : callState === 'connecting'
          ? labels.connecting
          : connected
            ? `${labels.appAudio} · ${formatDuration(duration)}`
            : labels.connected

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return createPortal(
    <button
      type="button"
      onClick={onRestore}
      aria-label={labels.tapToShowCall}
      title={labels.tapToShowCall}
      style={{
        position: 'fixed',
        bottom: 'max(12px, env(safe-area-inset-bottom))',
        left: '12px',
        right: '12px',
        zIndex: MINIMIZED_CALL_Z_INDEX,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        border: 'none',
        borderRadius: '14px',
        background: 'linear-gradient(135deg, #166534, #15803d)',
        color: 'white',
        cursor: 'pointer',
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.28)',
        boxSizing: 'border-box',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.2)',
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontWeight: 700,
            fontSize: '14px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {displayName(remoteUser) || labels.appAudio}
        </span>
        <span style={{ display: 'block', fontSize: '12px', opacity: 0.9 }}>{statusLabel}</span>
      </span>
      <span style={{ fontSize: '12px', fontWeight: 600, opacity: 0.95, flexShrink: 0 }}>
        {labels.tapToShowCall}
      </span>
    </button>,
    document.body,
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
  isSpeakerOn,
  hasVideo = false,
  isCameraOff = false,
  nativeOwnsVideo = false,
  localVideoRef,
  remoteVideoRef,
  labels,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleCamera,
  onToggleSpeaker,
  speakerEnabled = false,
  onHide,
  onRestoreCallUi,
  placement = 'floating',
  inAppHint,
  fullscreenCallUi = false,
  popupCallUi = false,
  minimizedCallUi = false,
  ringtoneId,
  onRingtoneChange,
}: VoiceCallOverlayProps) {
  if (callState === 'idle' || callState === 'ended') return null

  if (minimizedCallUi && onRestoreCallUi) {
    return (
      <FloatingMinimizedCallBar
        callState={callState}
        remoteUser={remoteUser}
        labels={labels}
        onRestore={onRestoreCallUi}
      />
    )
  }

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

  const callMode: CallUiMode = popupCallUi ? 'popup' : 'fullscreen'

  if (fullscreenCallUi || popupCallUi) {
    if (callState === 'incoming') {
      return (
        <IncomingCallScreen
          remoteUser={remoteUser}
          labels={labels}
          onAccept={onAccept}
          onReject={onReject}
          onHide={onHide}
          ringtoneId={ringtoneId}
          onRingtoneChange={onRingtoneChange}
          mode={callMode}
        />
      )
    }

    return (
      <ActiveCallScreen
        callState={callState}
        remoteUser={remoteUser}
        isMuted={isMuted}
        isSpeakerOn={isSpeakerOn}
        hasVideo={hasVideo}
        isCameraOff={isCameraOff}
        nativeOwnsVideo={nativeOwnsVideo}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        labels={labels}
        onEnd={onEnd}
        onToggleMute={onToggleMute}
        onToggleCamera={onToggleCamera}
        onToggleSpeaker={onToggleSpeaker}
        speakerEnabled={speakerEnabled}
        onHide={onHide}
        ringtoneId={ringtoneId}
        onRingtoneChange={onRingtoneChange}
        mode={callMode}
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
