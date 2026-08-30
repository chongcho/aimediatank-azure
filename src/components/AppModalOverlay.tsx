'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

/** Above navbar (100010) and Talk/Chat panels (100026) so media popups stay on top. */
export const APP_MODAL_Z_CLASS = 'z-[100060]'

/** Put on a title bar (or grip strip) to enable dragging the popup. */
export const APP_MODAL_DRAG_HANDLE_ATTR = 'data-app-modal-drag-handle'

/** Popup panel background (former header highlight color). */
export const APP_MODAL_PANEL_CLASS = 'bg-tank-light'

/** Highlighted draggable title bar — light gray on tank-light panel. */
export const APP_MODAL_DRAG_HEADER_CLASS =
  'cursor-grab active:cursor-grabbing border-b border-gray-400/50 bg-gray-500 hover:bg-gray-400 transition-colors'

/** Title row with close button — Share, Card, Email. */
export const APP_MODAL_DRAG_HEADER_ROW_CLASS = `flex items-center justify-between -mx-3 -mt-3 px-5 py-3 mb-4 rounded-t-2xl ${APP_MODAL_DRAG_HEADER_CLASS}`

export type AppModalOverlayProps = {
  open: boolean
  onClose?: () => void
  children: ReactNode
  /** Ignored — popups stay open until explicitly closed (like Talk/Chat). */
  closeOnBackdrop?: boolean
  className?: string
  backdropClassName?: string
  panelClassName?: string
  /** Extra attributes for the dialog panel (e.g. aria-labelledby). */
  dialogProps?: React.HTMLAttributes<HTMLDivElement>
}

function clampPanelPosition(x: number, y: number, width: number, height: number) {
  const pad = 8
  const maxX = Math.max(pad, window.innerWidth - width - pad)
  const maxY = Math.max(pad, window.innerHeight - height - pad)
  return {
    x: Math.min(Math.max(pad, x), maxX),
    y: Math.min(Math.max(pad, y), maxY),
  }
}

/**
 * Non-blocking floating popup — page stays interactive behind the panel (Talk/Chat style).
 * Drag via elements marked with {@link APP_MODAL_DRAG_HANDLE_ATTR}.
 */
export default function AppModalOverlay({
  open,
  children,
  className = '',
  panelClassName = '',
  dialogProps,
}: AppModalOverlayProps) {
  const [mounted, setMounted] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) {
      setPosition(null)
      setIsDragging(false)
    }
  }, [open])

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('button, a, input, textarea, select, label, [contenteditable="true"]')) {
      return
    }
    if (!target.closest(`[${APP_MODAL_DRAG_HANDLE_ATTR}]`)) return

    const panel = panelRef.current
    if (!panel) return

    e.preventDefault()
    const rect = panel.getBoundingClientRect()
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
    setPosition((prev) => prev ?? { x: rect.left, y: rect.top })
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const onPointerMove = (e: PointerEvent) => {
      const panel = panelRef.current
      if (!panel) return
      const { x, y } = clampPanelPosition(
        e.clientX - dragOffsetRef.current.x,
        e.clientY - dragOffsetRef.current.y,
        panel.offsetWidth,
        panel.offsetHeight
      )
      setPosition({ x, y })
    }

    const onPointerUp = () => setIsDragging(false)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [isDragging])

  useEffect(() => {
    if (!isDragging) return
    const prev = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.userSelect = prev
    }
  }, [isDragging])

  if (!open || !mounted) return null

  const { className: dialogClassName, ...restDialogProps } = dialogProps ?? {}
  const isPositioned = position !== null

  return createPortal(
    <div
      className={`fixed inset-0 pointer-events-none ${isPositioned ? '' : 'flex items-center justify-center p-4'} ${APP_MODAL_Z_CLASS} ${className}`}
      role="presentation"
    >
      <div
        {...restDialogProps}
        ref={panelRef}
        className={`relative max-w-full pointer-events-auto overscroll-contain ${isDragging ? 'cursor-grabbing' : ''} ${panelClassName}${dialogClassName ? ` ${dialogClassName}` : ''}`}
        style={
          isPositioned
            ? { position: 'fixed', left: position.x, top: position.y, touchAction: isDragging ? 'none' : undefined }
            : undefined
        }
        role={restDialogProps.role ?? 'dialog'}
        aria-modal={restDialogProps['aria-modal'] ?? false}
        onPointerDown={handlePointerDown}
        onClick={(e) => {
          e.stopPropagation()
          restDialogProps.onClick?.(e)
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
