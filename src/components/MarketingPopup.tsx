'use client'

import { useEffect, useRef, useState } from 'react'
import MarketingPopupView, { isUsableImageUrl } from '@/components/MarketingPopupView'

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
const SESSION_SHOWN_KEY = 'marketingPopupShown'
const APPEAR_DELAY_MS = 700

// Hoisted promise so the active-popup endpoint is hit at most once per tab,
// even if MarketingPopup unmounts/remounts (HomeContent has many effects that
// can briefly retrigger child mounts on the home page).
let activePopupPromise: Promise<ActivePopup | null> | null = null
function fetchActivePopupOnce(): Promise<ActivePopup | null> {
  if (activePopupPromise) return activePopupPromise
  activePopupPromise = fetch('/api/promotion/active-popup', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => (data?.promo ?? null) as ActivePopup | null)
    .catch(() => null)
  return activePopupPromise
}

export default function MarketingPopup() {
  const [promo, setPromo] = useState<ActivePopup | null>(null)
  const [visible, setVisible] = useState(false)
  // Drives the opacity transition: false = transparent, true = full opacity.
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
        // Once shown in this tab, don't show again until the user reloads the
        // tab or navigates away. Prevents the popup from re-appearing if the
        // home subtree happens to remount.
        if (sessionStorage.getItem(SESSION_SHOWN_KEY) === p.id) return
      } catch {}

      setPromo(p)
      appearTimer = window.setTimeout(() => {
        setVisible(true)
        try {
          sessionStorage.setItem(SESSION_SHOWN_KEY, p.id)
        } catch {}
        // Trigger fade-in on the next frame so the transition runs.
        requestAnimationFrame(() => setEntered(true))
      }, APPEAR_DELAY_MS)
    })

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
