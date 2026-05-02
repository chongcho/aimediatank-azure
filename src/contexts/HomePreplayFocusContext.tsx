'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  /** True while the feed grid is hidden for scroll restore — mobile focus IO is paused and state is flushed when this clears. */
  layoutSuppressed: boolean
}

const HomePreplayFocusContext = createContext<HomePreplayFocusContextValue | null>(null)

/** Picks one homepage VIDEO card for mobile preplay: highest visible fraction, then closest to viewport vertical center. */
export function HomePreplayFocusProvider({
  children,
  layoutSuppressed = false,
}: {
  children: React.ReactNode
  /** When true (e.g. home grid `invisible` during scroll restore), skip focus IO and reset scores when it clears. */
  layoutSuppressed?: boolean
}) {
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
  const prevLayoutSuppressedRef = useRef<boolean | null>(null)

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
    // Do not clear focus when the map is briefly empty (scroll / IO churn); that made every tile
    // `focusedMediaId !== id` and stopped mobile preplay until a new winner appeared.
    if (scores.size === 0) {
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

  /**
   * Scroll restore hides the grid (`invisible`); intersection entries clear while sticky focus kept a stale id,
   * so no tile matched `focusedMediaId` after return from /media. Clear when entering suppress; after suppress
   * lifts, defer a flush so visible cards re-report before we pick a new winner.
   */
  useEffect(() => {
    const prev = prevLayoutSuppressedRef.current
    prevLayoutSuppressedRef.current = layoutSuppressed

    if (layoutSuppressed) {
      scoresRef.current.clear()
      setFocusedMediaId(null)
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }

    if (prev !== true) {
      return
    }

    let inner: number | null = null
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        scoresRef.current.clear()
        setFocusedMediaId(null)
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      if (inner != null) cancelAnimationFrame(inner)
    }
  }, [layoutSuppressed])

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      scoresRef.current.clear()
      setFocusedMediaId(null)
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const value = useMemo(
    () => ({
      focusedMediaId,
      previewSoundOn,
      togglePreviewSound,
      reportPreplayIntersection,
      unregisterPreplay,
      layoutSuppressed,
    }),
    [
      focusedMediaId,
      previewSoundOn,
      togglePreviewSound,
      reportPreplayIntersection,
      unregisterPreplay,
      layoutSuppressed,
    ]
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
  className = 'h-[15.4px] w-[15.4px]',
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

