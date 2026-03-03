'use client'

import { useEffect, Suspense } from 'react'
import AboutPage from '@/app/about/page'

export default function AboutModal() {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

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
