'use client'

import { useEffect, useState } from 'react'
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
const APPEAR_DELAY_MS = 700

export default function MarketingPopup() {
  const [promo, setPromo] = useState<ActivePopup | null>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    let cancelled = false
    let appearTimer: number | undefined

    fetch('/api/promotion/active-popup', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.promo) return
        const p = data.promo as ActivePopup
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

  if (!promo || !show) return null

  return (
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
  )
}
