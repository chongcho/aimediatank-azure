'use client'

import { useEffect, Suspense } from 'react'

export default function InterceptedPageWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[60] bg-tank-black overflow-y-auto"
      data-initial-content
    >
      <Suspense>{children}</Suspense>
    </div>
  )
}
