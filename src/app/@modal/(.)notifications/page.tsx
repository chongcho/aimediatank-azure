'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import NotificationsPage from '@/app/notifications/page'

export default function NotificationsModal() {
  return (
    <InterceptedPageWrapper>
      <NotificationsPage />
    </InterceptedPageWrapper>
  )
}
