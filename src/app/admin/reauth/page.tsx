'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import AdminReauthGate from '@/components/AdminReauthGate'

export default function AdminReauthPage() {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/login?callbackUrl=${encodeURIComponent('/admin')}`)
    }
  }, [status, router])

  return (
    <AdminReauthGate
      onVerified={() => {
        window.location.assign('/')
      }}
    />
  )
}
