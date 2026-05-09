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

// Previous versions used this key for "permanent X-button dismiss". The
// product decision changed to "X without snooze should reappear on refresh"
// so we no longer write this key — but we proactively clean up any leftover
// values on mount so existing users see the popup again.
const LEGACY_DISMISS_KEY_PREFIX = 'marketingPopupDismissed:'

const SNOOZE_UNTIL_KEY_PREFIX = 'marketingPopupSnoozeUntil:'
const APPEAR_DELAY_MS = 700
const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000

// Hoisted promise so the active-popup endpoint is hit at most once per tab.
let activePopupPromise: Promise<ActivePopup | null> | null = null
function fetchActivePopupOnce(): Promise<ActivePopup | null> {
  if (activePopupPromise) return activePopupPromise
  activePopupPromise = fetch('/api/promotion/active-popup', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => (data?.promo ?? null) as ActivePopup | null)
    .catch(() => null)
  return activePopupPromise
}

// Module-level state, scoped to the current JS runtime. Resets on full page
// reload (browser refresh) so the popup returns then; survives soft remounts
// of <MarketingPopup /> within the same page.
//   - shownPromoId: popup is currently visible (not yet closed). On remount,
//     restore visibility instantly without re-running the appear delay.
//   - dismissedPromoId: user closed the popup with the X button (without
//     ticking the 24h checkbox). Stay hidden for the rest of this runtime.
let shownPromoId: string | null = null
let dismissedPromoId: string | null = null

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

      // Closed via X earlier in this runtime — stay hidden until refresh.
      if (dismissedPromoId === p.id) return

      try {
        // One-time migration: clear any legacy permanent-dismiss flag so the
        // popup can re-appear under the new "X = session-only close" rule.
        localStorage.removeItem(`${LEGACY_DISMISS_KEY_PREFIX}${p.id}`)

        const snoozeUntilRaw = localStorage.getItem(`${SNOOZE_UNTIL_KEY_PREFIX}${p.id}`)
        if (snoozeUntilRaw) {
          const snoozeUntil = parseInt(snoozeUntilRaw, 10)
          if (!Number.isNaN(snoozeUntil) && snoozeUntil > Date.now()) return
          localStorage.removeItem(`${SNOOZE_UNTIL_KEY_PREFIX}${p.id}`)
        }
      } catch {}

      setPromo(p)

      // Soft remount during a still-open popup — restore visibility now,
      // skip the appear delay and the fade-in (already past that).
      if (shownPromoId === p.id) {
        setVisible(true)
        setEntered(true)
        return
      }

      appearTimer = window.setTimeout(() => {
        setVisible(true)
        shownPromoId = p.id
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
      if (options?.snooze24h) {
        try {
          localStorage.setItem(
            `${SNOOZE_UNTIL_KEY_PREFIX}${promo.id}`,
            String(Date.now() + SNOOZE_DURATION_MS),
          )
        } catch {}
      } else {
        // Plain X close: do NOT persist anything. Popup returns on next
        // browser refresh / new tab. Mark in-runtime so it stays gone for
        // this tab session even if the wrapper remounts.
        dismissedPromoId = promo.id
      }
    }
    shownPromoId = null
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
