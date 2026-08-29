'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Above navbar (100010) so backdrop blocks page chrome while a dialog is open. */
export const APP_MODAL_Z_CLASS = 'z-[100060]'

export type AppModalOverlayProps = {
  open: boolean
  onClose?: () => void
  children: ReactNode
  closeOnBackdrop?: boolean
  className?: string
  backdropClassName?: string
  panelClassName?: string
  /** Extra attributes for the dialog panel (e.g. aria-labelledby). */
  dialogProps?: React.HTMLAttributes<HTMLDivElement>
}

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [locked])
}

export default function AppModalOverlay({
  open,
  onClose,
  children,
  closeOnBackdrop = true,
  className = '',
  backdropClassName = 'bg-black/50',
  panelClassName = '',
  dialogProps,
}: AppModalOverlayProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useBodyScrollLock(open)

  if (!open || !mounted) return null

  const { className: dialogClassName, ...restDialogProps } = dialogProps ?? {}

  return createPortal(
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${APP_MODAL_Z_CLASS} ${className}`}
      role="presentation"
    >
      <div
        className={`absolute inset-0 touch-none overscroll-none ${backdropClassName}`}
        aria-hidden
        onClick={closeOnBackdrop && onClose ? onClose : undefined}
      />
      <div
        {...restDialogProps}
        className={`relative z-10 flex w-full justify-center touch-auto overscroll-contain ${panelClassName}${dialogClassName ? ` ${dialogClassName}` : ''}`}
        role={restDialogProps.role ?? 'dialog'}
        aria-modal={restDialogProps['aria-modal'] ?? true}
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
