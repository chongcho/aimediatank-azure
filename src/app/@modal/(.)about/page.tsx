'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import AboutPage from '@/app/about/page'

export default function AboutModal() {
  return (
    <InterceptedPageWrapper>
      <AboutPage />
    </InterceptedPageWrapper>
  )
}
