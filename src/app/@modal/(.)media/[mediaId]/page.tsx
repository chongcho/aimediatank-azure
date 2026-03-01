'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useCallback } from 'react'
import MediaPageClient from '@/app/media/[mediaId]/MediaPageClient'

export default function MediaModal({ params }: { params: { mediaId: string } }) {
  const router = useRouter()

  const onClose = useCallback(() => {
    router.back()
  }, [router])

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
      <MediaPageClient mediaId={params.mediaId} />
    </div>
  )
}
