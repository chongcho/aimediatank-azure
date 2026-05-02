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
  /** When true, all homepage video preplays use sound (where the browser allows). Sole control — no per-card sound UI. */
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

/** Speaker + waves (on) or same with diagonal slash (muted / off). */
export function PreplayVolumeIcon({
  muted,
  className = 'h-5 w-5',
}: {
  muted: boolean
  className?: string
}) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728"
        className={muted ? 'opacity-40' : undefined}
      />
      {muted ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M4 4l16 16" />
      ) : null}
    </svg>
  )
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
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-tank-light bg-tank-gray text-gray-200 transition-colors hover:border-tank-accent/50 hover:text-white"
      title={previewSoundOn ? 'Mute video previews on the home feed' : 'Play video previews with sound on the home feed'}
    >
      <PreplayVolumeIcon muted={!previewSoundOn} className="h-5 w-5" />
    </button>
  )
}
