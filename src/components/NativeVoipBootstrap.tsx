'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useRef } from 'react'
import {
  bootstrapNativePush,
  isNativeVoiceCallApp,
  subscribeNativePushIfNeeded,
} from '@/lib/nativeCallBridge'

/** Early native push bootstrap + retries after sign-in (iOS PushKit / Android FCM). */
export default function NativeVoipBootstrap() {
  const { data: session } = useSession()
  const retryRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSyncAtRef = useRef(0)

  useEffect(() => {
    if (!isNativeVoiceCallApp()) return
    void bootstrapNativePush()
  }, [])

  useEffect(() => {
    if (!isNativeVoiceCallApp()) return

    if (!session?.user?.id) {
      if (retryRef.current) {
        clearInterval(retryRef.current)
        retryRef.current = null
      }
      return
    }

    const SYNC_MIN_GAP_MS = 60_000

    const sync = () => {
      const now = Date.now()
      if (now - lastSyncAtRef.current < SYNC_MIN_GAP_MS) return
      lastSyncAtRef.current = now
      void subscribeNativePushIfNeeded(session.user!.id)
    }

    sync()
    retryRef.current = setInterval(sync, 5 * 60 * 1000)

    const onVisible = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        sync()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      if (retryRef.current) {
        clearInterval(retryRef.current)
        retryRef.current = null
      }
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [session?.user?.id])

  return null
}
