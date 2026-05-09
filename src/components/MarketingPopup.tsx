'use client'

import { useEffect, useState } from 'react'

type ActivePopup = {
  id: string
  popupTitle: string | null
  popupMessage: string | null
  popupButtonText: string | null
  popupImageUrl: string | null
  promoCode: string | null
  endDate: string | null
}

const DISMISS_KEY_PREFIX = 'marketingPopupDismissed:'
const APPEAR_DELAY_MS = 700

function isUsableImageUrl(u: string | null | undefined): u is string {
  return !!u && /^https?:\/\//i.test(u)
}

export default function MarketingPopup() {
  const [promo, setPromo] = useState<ActivePopup | null>(null)
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    let appearTimer: number | undefined

    fetch('/api/promotion/active-popup', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.promo) return
        const p = data.promo as ActivePopup
        // Only show if there's something to display.
        if (!p.popupTitle && !p.popupMessage && !isUsableImageUrl(p.popupImageUrl)) return
        try {
          if (localStorage.getItem(`${DISMISS_KEY_PREFIX}${p.id}`) === '1') return
        } catch {}
        setPromo(p)
        appearTimer = window.setTimeout(() => setShow(true), APPEAR_DELAY_MS)
      })
      .catch(() => {})

    return () => {
      cancelled = true
      if (appearTimer !== undefined) window.clearTimeout(appearTimer)
    }
  }, [])

  const handleClose = () => {
    if (promo) {
      try {
        localStorage.setItem(`${DISMISS_KEY_PREFIX}${promo.id}`, '1')
      } catch {}
    }
    setShow(false)
  }

  const handleCta = async () => {
    if (!promo) return
    if (promo.promoCode) {
      try {
        await navigator.clipboard.writeText(promo.promoCode)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      } catch {}
      return
    }
    handleClose()
  }

  if (!promo || !show) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="marketing-popup-title"
      className="fixed inset-0 z-[99997] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-tank-dark border border-tank-light shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-gray-700/80 hover:bg-gray-600/80 text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {isUsableImageUrl(promo.popupImageUrl) && (
          <div className="aspect-[16/9] bg-tank-gray">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={promo.popupImageUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="eager"
            />
          </div>
        )}

        <div className="p-6">
          {promo.popupTitle && (
            <h2 id="marketing-popup-title" className="text-xl font-bold text-white mb-2">
              {promo.popupTitle}
            </h2>
          )}
          {promo.popupMessage && (
            <p className="text-gray-300 text-sm whitespace-pre-line mb-4">{promo.popupMessage}</p>
          )}

          {promo.promoCode && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-tank-gray border border-tank-light flex items-center justify-between gap-3">
              <span className="text-xs text-gray-400">Promo code</span>
              <code className="text-tank-accent font-mono text-sm tracking-wider">
                {promo.promoCode}
              </code>
            </div>
          )}

          <button
            type="button"
            onClick={handleCta}
            className="w-full py-2.5 rounded-lg bg-tank-accent text-tank-black font-semibold hover:opacity-90 transition-opacity"
          >
            {copied ? 'Copied!' : promo.popupButtonText || 'Get Offer'}
          </button>

          {promo.endDate && (
            <p className="mt-3 text-center text-xs text-gray-500">
              Ends {new Date(promo.endDate).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
