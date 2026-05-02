'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'

const PREVIEW_SOUND_STORAGE_KEY = 'homePreviewSoundOn'

type Score = { ratio: number; centerY: number }

type HomePreplayFocusContextValue = {
  focusedMediaId: string | null
  /** When true, all homepage video preplays use sound (where the browser allows). */
  previewSoundOn: boolean
  togglePreviewSound: () => void
  reportPreplayIntersection: (mediaId: string, entry: IntersectionObserverEntry) => void
  unregisterPreplay: (mediaId: string) => void
}

const HomePreplayFocusContext = createContext<HomePreplayFocusContextValue | null>(null)

/** Picks one homepage VIDEO card for mobile preplay: highest visible fraction, then closest to viewport vertical center. */
export function HomePreplayFocusProvider({ children }: { children: React.ReactNode }) {
  const scoresRef = useRef<Map<string, Score>>(new Map())
  const [focusedMediaId, setFocusedMediaId] = useState<string | null>(null)
  const [previewSoundOn, setPreviewSoundOn] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return sessionStorage.getItem(PREVIEW_SOUND_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const rafRef = useRef<number | null>(null)

  const togglePreviewSound = useCallback(() => {
    setPreviewSoundOn((prev) => {
      const next = !prev
      try {
        sessionStorage.setItem(PREVIEW_SOUND_STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const recomputeFocused = useCallback(() => {
    rafRef.current = null
    const scores = scoresRef.current
    if (scores.size === 0) {
      setFocusedMediaId((prev) => (prev === null ? prev : null))
      return
    }
    const midY =
      typeof window !== 'undefined' ? window.innerHeight / 2 : 400
    let bestId: string | null = null
    let bestRatio = -1
    let bestDist = Infinity
    scores.forEach(({ ratio, centerY }, id) => {
      const dist = Math.abs(centerY - midY)
      if (
        bestId === null ||
        ratio > bestRatio + 1e-4 ||
        (Math.abs(ratio - bestRatio) < 1e-4 && dist < bestDist)
      ) {
        bestId = id
        bestRatio = ratio
        bestDist = dist
      }
    })
    setFocusedMediaId((prev) => (prev === bestId ? prev : bestId))
  }, [])

  const scheduleRecompute = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(recomputeFocused)
  }, [recomputeFocused])

  const reportPreplayIntersection = useCallback(
    (mediaId: string, entry: IntersectionObserverEntry) => {
      if (!entry.isIntersecting || entry.intersectionRatio <= 0) {
        scoresRef.current.delete(mediaId)
      } else {
        const r = entry.boundingClientRect
        scoresRef.current.set(mediaId, {
          ratio: entry.intersectionRatio,
          centerY: r.top + r.height / 2,
        })
      }
      scheduleRecompute()
    },
    [scheduleRecompute]
  )

  const unregisterPreplay = useCallback(
    (mediaId: string) => {
      scoresRef.current.delete(mediaId)
      scheduleRecompute()
    },
    [scheduleRecompute]
  )

  const value = useMemo(
    () => ({
      focusedMediaId,
      previewSoundOn,
      togglePreviewSound,
      reportPreplayIntersection,
      unregisterPreplay,
    }),
    [focusedMediaId, previewSoundOn, togglePreviewSound, reportPreplayIntersection, unregisterPreplay]
  )

  return (
    <HomePreplayFocusContext.Provider value={value}>
      {children}
    </HomePreplayFocusContext.Provider>
  )
}

export function useHomePreplayFocus() {
  return useContext(HomePreplayFocusContext)
}

/** Homepage only: global preplay sound on/off (must render under HomePreplayFocusProvider). */
export function HomePreviewSoundToggle({ preplayEnabled }: { preplayEnabled: boolean }) {
  const ctx = useHomePreplayFocus()
  if (!ctx || !preplayEnabled) return null
  const { previewSoundOn, togglePreviewSound } = ctx
  return (
    <button
      type="button"
      onClick={togglePreviewSound}
      aria-pressed={previewSoundOn}
      className="inline-flex items-center gap-2 rounded-lg border border-tank-light bg-tank-gray px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-tank-accent/50 hover:text-white"
      title={previewSoundOn ? 'Mute video previews on the home feed' : 'Play video previews with sound on the home feed'}
    >
      <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        {previewSoundOn ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
          />
        ) : (
          <>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </>
        )}
      </svg>
      <span className="hidden min-[380px]:inline">{previewSoundOn ? 'Preview sound on' : 'Preview sound off'}</span>
    </button>
  )
}
