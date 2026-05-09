'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { isAppAdminRole } from '@/lib/adminFreshStep2'

/**
 * Whether the signed-in admin has completed Step 2 verification recently enough that the httpOnly
 * elevation cookie is present (`contentElevated` from GET /api/admin/verify-access).
 */
export function useAdminContentElevation() {
  const { data: session, status } = useSession()
  const [loaded, setLoaded] = useState(false)
  const [contentElevated, setContentElevated] = useState(false)

  useEffect(() => {
    if (status === 'loading') {
      return
    }
    if (status !== 'authenticated' || !session?.user) {
      setLoaded(true)
      setContentElevated(false)
      return
    }
    if (!isAppAdminRole(session.user.role)) {
      setLoaded(true)
      setContentElevated(false)
      return
    }

    let cancelled = false
    fetch('/api/admin/verify-access', { credentials: 'include', cache: 'no-store' })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as { contentElevated?: boolean }
        if (cancelled) return
        setContentElevated(!!data.contentElevated)
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) {
          setContentElevated(false)
          setLoaded(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [status, session?.user?.id, session?.user?.role])

  return { loaded, contentElevated }
}
