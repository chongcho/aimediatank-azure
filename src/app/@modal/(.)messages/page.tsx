'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import MessagesPage from '@/app/messages/page'

export default function MessagesModal() {
  return (
    <InterceptedPageWrapper>
      <MessagesPage />
    </InterceptedPageWrapper>
  )
}
