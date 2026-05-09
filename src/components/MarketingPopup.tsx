'use client'

import { useEffect, useRef, useState } from 'react'
import MarketingPopupView, {
  isUsableImageUrl,
  type MarketingPopupCloseOptions,
} from '@/components/MarketingPopupView'

type ActivePopup = {
  id: string
  popupTitle: string | null
  popupMessage: string | null
  popupButtonText: string | null
  popupImageUrl: string | null
  popupCtaUrl: string | null
  promoCode: string | null
  endDate: string | null
}

const DISMISS_KEY_PREFIX = 'marketingPopupDismissed:'
const SNOOZE_UNTIL_KEY_PREFIX = 'marketingPopupSnoozeUntil:'
const APPEAR_DELAY_MS = 700
const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000

// Hoisted promise so the active-popup endpoint is hit at most once per tab,
// even if MarketingPopup unmounts/remounts.
let activePopupPromise: Promise<ActivePopup | null> | null = null
function fetchActivePopupOnce(): Promise<ActivePopup | null> {
  if (activePopupPromise) return activePopupPromise
  activePopupPromise = fetch('/api/promotion/active-popup', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => (data?.promo ?? null) as ActivePopup | null)
    .catch(() => null)
  return activePopupPromise
}

// Module-level "the user has not closed this popup yet" state. Survives
// MarketingPopup unmount/remount within the same page so the popup truly
// stays on until the user closes it via the X button. The home page subtree
// can remount the popup wrapper for various reasons (filter changes, scroll
// restoration); without this the popup would silently disappear on remount.
//
// This state intentionally lives in module scope so it resets on a full page
// load (new tab, hard refresh) but survives soft remounts.
let activePromoIdShown: string | null = null
function markPromoShown(id: string) {
  activePromoIdShown = id
}
function isPromoStillOpen(id: string) {
  return activePromoIdShown === id
}
function markPromoClosed() {
  activePromoIdShown = null
}

export default function MarketingPopup() {
  const [promo, setPromo] = useState<ActivePopup | null>(null)
  const [visible, setVisible] = useState(false)
  const [entered, setEntered] = useState(false)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    let cancelled = false
    let appearTimer: number | undefined

    fetchActivePopupOnce().then((p) => {
      if (cancelled || !p) return
      if (!p.popupTitle && !p.popupMessage && !isUsableImageUrl(p.popupImageUrl)) return
      try {
        if (localStorage.getItem(`${DISMISS_KEY_PREFIX}${p.id}`) === '1') return
        const snoozeUntilRaw = localStorage.getItem(`${SNOOZE_UNTIL_KEY_PREFIX}${p.id}`)
        if (snoozeUntilRaw) {
          const snoozeUntil = parseInt(snoozeUntilRaw, 10)
          if (!Number.isNaN(snoozeUntil) && snoozeUntil > Date.now()) return
          localStorage.removeItem(`${SNOOZE_UNTIL_KEY_PREFIX}${p.id}`)
        }
      } catch {}

      setPromo(p)

      // If a previous mount already showed this popup and the user never
      // closed it, restore visibility immediately on remount — no extra
      // appear delay, no fade-in flicker. Otherwise schedule the first
      // appearance.
      if (isPromoStillOpen(p.id)) {
        setVisible(true)
        setEntered(true)
        return
      }

      appearTimer = window.setTimeout(() => {
        setVisible(true)
        markPromoShown(p.id)
        requestAnimationFrame(() => setEntered(true))
      }, APPEAR_DELAY_MS)
    })

    return () => {
      cancelled = true
      if (appearTimer !== undefined) window.clearTimeout(appearTimer)
    }
  }, [])

  const handleClose = (options?: MarketingPopupCloseOptions) => {
    if (promo) {
      try {
        if (options?.snooze24h) {
          localStorage.setItem(
            `${SNOOZE_UNTIL_KEY_PREFIX}${promo.id}`,
            String(Date.now() + SNOOZE_DURATION_MS),
          )
          localStorage.removeItem(`${DISMISS_KEY_PREFIX}${promo.id}`)
        } else {
          localStorage.setItem(`${DISMISS_KEY_PREFIX}${promo.id}`, '1')
        }
      } catch {}
    }
    markPromoClosed()
    // Fade out, then unmount.
    setEntered(false)
    window.setTimeout(() => setVisible(false), 200)
  }

  if (!promo || !visible) return null

  return (
    <div
      style={{
        opacity: entered ? 1 : 0,
        transition: 'opacity 200ms ease-out',
      }}
    >
      <MarketingPopupView
        popupTitle={promo.popupTitle}
        popupMessage={promo.popupMessage}
        popupButtonText={promo.popupButtonText}
        popupImageUrl={promo.popupImageUrl}
        popupCtaUrl={promo.popupCtaUrl}
        promoCode={promo.promoCode}
        endDate={promo.endDate}
        onClose={handleClose}
      />
    </div>
  )
}
