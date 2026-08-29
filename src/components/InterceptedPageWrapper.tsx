'use client'

import { useEffect, Suspense } from 'react'
import SiteFooter from '@/components/SiteFooter'

export default function InterceptedPageWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div
      className="intercepted-page-shell fixed inset-0 z-[60] bg-black overflow-y-auto"
      data-initial-content
    >
      <Suspense>{children}</Suspense>
      {/* Layout footer sits outside this shell; include it here so soft-nav routes can scroll to it. */}
      <SiteFooter />
    </div>
  )
}
