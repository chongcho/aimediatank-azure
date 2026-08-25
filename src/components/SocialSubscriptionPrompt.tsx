'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  SOCIAL_SUBSCRIPTION_REGISTER_HREF,
  SOCIAL_SUBSCRIPTION_REQUIRED_MESSAGE,
} from '@/lib/socialSubscriptionGate'

type Props = {
  open: boolean
  /** Desktop: position under this element. Mobile / missing: centered dialog. */
  anchorEl: HTMLElement | null
  onClose: () => void
}

const PANEL_WIDTH = 320

/**
 * Subscription gate dialog. On desktop with an anchor (Talk/Chat), sits just under
 * that button; otherwise centered like a modal.
 */
export default function SocialSubscriptionPrompt({ open, anchorEl, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; anchored: boolean } | null>(
    null,
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }

    const place = () => {
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
      if (!isDesktop || !anchorEl) {
        setCoords({ top: 0, left: 0, anchored: false })
        return
      }
      const rect = anchorEl.getBoundingClientRect()
      const width = panelRef.current?.offsetWidth || PANEL_WIDTH
      let left = rect.left + rect.width / 2 - width / 2
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      const top = rect.bottom + 8
      setCoords({ top, left, anchored: true })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorEl])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !mounted || !coords) return null

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="social-sub-prompt-title"
      className="w-[min(320px,calc(100vw-16px))] rounded-lg border border-gray-300 bg-white text-gray-900 shadow-xl"
      style={
        coords.anchored
          ? {
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              zIndex: 100050,
            }
          : undefined
      }
      onClick={(e) => e.stopPropagation()}
    >
      <div className="border-b border-gray-200 px-4 py-2.5">
        <p id="social-sub-prompt-title" className="text-sm font-semibold text-gray-800">
          aimediatank.com says
        </p>
      </div>
      <div className="px-4 py-3 text-sm leading-relaxed text-gray-800">
        <p>{SOCIAL_SUBSCRIPTION_REQUIRED_MESSAGE}</p>
        <p className="mt-3">
          <Link
            href={SOCIAL_SUBSCRIPTION_REGISTER_HREF}
            className="font-medium text-blue-600 underline hover:text-blue-800"
            onClick={onClose}
          >
            Register
          </Link>
        </p>
      </div>
      <div className="flex justify-end border-t border-gray-200 px-3 py-2.5">
        <button
          type="button"
          className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          onClick={onClose}
        >
          OK
        </button>
      </div>
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-[100050]" role="presentation">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      {coords.anchored ? (
        panel
      ) : (
        <div className="absolute inset-0 flex items-start justify-center px-4 pt-24 sm:items-center sm:pt-0">
          {panel}
        </div>
      )}
    </div>,
    document.body,
  )
}

