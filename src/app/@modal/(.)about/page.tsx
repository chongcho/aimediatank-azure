'use client'

import { useEffect, Suspense } from 'react'
import { usePathname } from 'next/navigation'
import AboutPage from '@/app/about/page'

export default function AboutModal() {
  const pathname = usePathname()
  const isActive = pathname === '/about'

  useEffect(() => {
    if (isActive) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isActive])

  if (!isActive) {
    return null
  }

  return (
    <div
      className="fixed top-16 left-0 right-0 bottom-0 z-40 bg-tank-black overflow-y-auto"
      data-initial-content
    >
      <Suspense>
        <AboutPage />
      </Suspense>
    </div>
  )
}
