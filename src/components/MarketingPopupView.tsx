'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type MarketingPopupCloseOptions = {
  /** If true, hide the popup for 24 hours (instead of permanently). */
  snooze24h?: boolean
}

export type MarketingPopupViewProps = {
  popupTitle: string | null
  popupMessage: string | null
  popupButtonText: string | null
  popupImageUrl: string | null
  popupCtaUrl?: string | null
  promoCode: string | null
  endDate: string | null
  onClose: (options?: MarketingPopupCloseOptions) => void
  /**
   * If provided, called on CTA click instead of the default behaviour
   * (copy promoCode → optionally navigate to popupCtaUrl). Used by the admin
   * preview to make the button a no-op.
   */
  onCta?: () => void
}

export function isUsableImageUrl(u: string | null | undefined): u is string {
  return !!u && /^https?:\/\//i.test(u)
}

export function isUsableExternalUrl(u: string | null | undefined): u is string {
  return !!u && /^https?:\/\/|^\//i.test(u)
}

function isInternalPath(u: string | null | undefined): u is string {
  return !!u && u.startsWith('/') && !u.startsWith('//')
}

/** Pure presentational popup. Data fetching, dismissal persistence, and targeting live in the wrappers. */
export default function MarketingPopupView({
  popupTitle,
  popupMessage,
  popupButtonText,
  popupImageUrl,
  popupCtaUrl,
  promoCode,
  endDate,
  onClose,
  onCta,
}: MarketingPopupViewProps) {
  const [copied, setCopied] = useState(false)
  const [snooze24h, setSnooze24h] = useState(false)
  const router = useRouter()

  const defaultCtaHandler = async () => {
    if (promoCode) {
      try {
        await navigator.clipboard.writeText(promoCode)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      } catch {}
    }
    // CTA click should dismiss the popup.
    onClose()
    if (isInternalPath(popupCtaUrl)) {
      router.push(popupCtaUrl)
      return
    }
    if (isUsableExternalUrl(popupCtaUrl)) {
      window.open(popupCtaUrl, '_blank', 'noopener,noreferrer')
      return
    }
  }

  const handleCta = onCta ?? defaultCtaHandler

  return (
    // Wrapper is non-blocking (pointer-events-none) so the home page behind stays fully interactive.
    // Only the inner card captures clicks. No dim overlay.
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="marketing-popup-title"
      className="fixed inset-0 z-[99997] flex items-center justify-center p-4 pointer-events-none"
    >
      <div
        className="pointer-events-auto relative w-full max-w-md rounded-2xl bg-orange-500 border border-orange-300/60 shadow-2xl overflow-hidden"
      >
        <button
          type="button"
          onClick={() => onClose({ snooze24h })}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {isUsableImageUrl(popupImageUrl) && (
          <div className="aspect-[16/9] bg-orange-600/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={popupImageUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="eager"
            />
          </div>
        )}

        <div className="p-6">
          {popupTitle && (
            <h2 id="marketing-popup-title" className="text-xl font-bold text-white mb-2 drop-shadow-sm">
              {popupTitle}
            </h2>
          )}
          {popupMessage && (
            <p className="text-white/95 text-sm whitespace-pre-line mb-4">{popupMessage}</p>
          )}

          {promoCode && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-black/30 border border-white/20 flex items-center justify-between gap-3">
              <span className="text-xs text-orange-50/90">Promo code</span>
              <code className="text-white font-mono text-sm tracking-wider font-semibold">
                {promoCode}
              </code>
            </div>
          )}

          <div className="mt-2 flex items-center justify-center gap-4">
            {endDate && (
              <p className="text-xs text-white/80 whitespace-nowrap">
                Ends {new Date(endDate).toLocaleDateString()}
              </p>
            )}
            <button
              type="button"
              onClick={handleCta}
              className="min-w-[100px] px-7 py-2 rounded-xl bg-green-500 text-white text-3xl font-extrabold hover:bg-green-600 transition-colors shadow leading-none"
            >
              {copied ? 'Copied!' : popupButtonText || 'Register'}
            </button>
          </div>

          <label className="mt-2 flex items-center justify-start gap-2 text-xs text-white/90 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={snooze24h}
              onChange={(e) => setSnooze24h(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-white/40 bg-white/10 text-orange-600 focus:ring-1 focus:ring-white/60 cursor-pointer"
            />
            Don&apos;t show for 24 hours
          </label>
        </div>
      </div>
    </div>
  )
}
