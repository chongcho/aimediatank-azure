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

    const sync = () => void subscribeNativePushIfNeeded()
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
