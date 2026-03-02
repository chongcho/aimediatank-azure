'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import AdminPage from '@/app/admin/page'

export default function AdminModal() {
  return (
    <InterceptedPageWrapper>
      <AdminPage />
    </InterceptedPageWrapper>
  )
}
