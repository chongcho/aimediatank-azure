'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { APP_BUILD_ID, APP_RELEASE_VERSION } from '@/lib/appVersion'

const VERSION_POLL_MS = 5 * 60 * 1000

function markSwUpdateReady(
  registration: ServiceWorkerRegistration,
  waitingWorkerRef: MutableRefObject<ServiceWorker | null>,
  setUpdateAvailable: Dispatch<SetStateAction<boolean>>
) {
  const waiting = registration.waiting
  if (waiting && navigator.serviceWorker.controller) {
    waitingWorkerRef.current = waiting
    setUpdateAvailable(true)
  }
}

export function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const waitingWorkerRef = useRef<ServiceWorker | null>(null)

  const checkServerVersion = useCallback(async () => {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { buildId?: string }
      if (data.buildId && data.buildId !== APP_BUILD_ID) {
        setUpdateAvailable(true)
      }
    } catch {
      // ignore network errors
    }
  }, [])

  const checkForUpdate = useCallback(async () => {
    await registrationRef.current?.update().catch(() => {})
    await checkServerVersion()
  }, [checkServerVersion])

  useEffect(() => {
    if (typeof window === 'undefined') return

    let interval: ReturnType<typeof setInterval> | undefined

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready.then((registration) => {
        registrationRef.current = registration
        markSwUpdateReady(registration, waitingWorkerRef, setUpdateAvailable)

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              waitingWorkerRef.current = newWorker
              setUpdateAvailable(true)
            }
          })
        })
      })
    }

    void checkForUpdate()
    interval = setInterval(() => {
      void checkForUpdate()
    }, VERSION_POLL_MS)

    const onVisible = () => {
      if (!document.hidden) void checkForUpdate()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (interval) clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [checkForUpdate])

  const applyUpdate = useCallback(() => {
    setIsUpdating(true)
    const waiting = waitingWorkerRef.current ?? registrationRef.current?.waiting

    if (waiting && 'serviceWorker' in navigator) {
      const onControllerChange = () => {
        try {
          sessionStorage.setItem('swReloaded', '1')
        } catch {
          // ignore
        }
        window.location.reload()
      }
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true })
      waiting.postMessage({ type: 'SKIP_WAITING' })
      return
    }

    window.location.reload()
  }, [])

  return {
    version: APP_RELEASE_VERSION,
    buildId: APP_BUILD_ID,
    updateAvailable,
    isUpdating,
    applyUpdate,
    checkForUpdate,
  }
}
