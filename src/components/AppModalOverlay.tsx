'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Above navbar (100010) and Talk/Chat panels (100026) so media popups stay on top. */
export const APP_MODAL_Z_CLASS = 'z-[100060]'

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

/**
 * Non-blocking floating popup — page stays interactive behind the panel (Talk/Chat style).
 */
export default function AppModalOverlay({
  open,
  children,
  className = '',
  panelClassName = '',
  dialogProps,
}: AppModalOverlayProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!open || !mounted) return null

  const { className: dialogClassName, ...restDialogProps } = dialogProps ?? {}

  return createPortal(
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 pointer-events-none ${APP_MODAL_Z_CLASS} ${className}`}
      role="presentation"
    >
      <div
        {...restDialogProps}
        className={`relative max-w-full pointer-events-auto overscroll-contain ${panelClassName}${dialogClassName ? ` ${dialogClassName}` : ''}`}
        role={restDialogProps.role ?? 'dialog'}
        aria-modal={restDialogProps['aria-modal'] ?? false}
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
