'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useRef } from 'react'
import { bootstrapNativeVoip, isNativeIosCallApp, subscribeNativeVoipIfNeeded } from '@/lib/nativeCallBridge'

/** Early VoIP bootstrap + retries after TestFlight sign-in. */
export default function NativeVoipBootstrap() {
  const { data: session } = useSession()
  const retryRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isNativeIosCallApp()) return
    void bootstrapNativeVoip()
  }, [])

  useEffect(() => {
    if (!isNativeIosCallApp()) return

    if (!session?.user?.id) {
      if (retryRef.current) {
        clearInterval(retryRef.current)
        retryRef.current = null
      }
      return
    }

    const sync = () => void subscribeNativeVoipIfNeeded()
    sync()
    retryRef.current = setInterval(sync, 20000)

    return () => {
      if (retryRef.current) {
        clearInterval(retryRef.current)
        retryRef.current = null
      }
    }
  }, [session?.user?.id])

  return null
}
