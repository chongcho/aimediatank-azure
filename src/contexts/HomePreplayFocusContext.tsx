'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'

type Score = { ratio: number; centerY: number }

type HomePreplayFocusContextValue = {
  focusedMediaId: string | null
  reportPreplayIntersection: (mediaId: string, entry: IntersectionObserverEntry) => void
  unregisterPreplay: (mediaId: string) => void
}

const HomePreplayFocusContext = createContext<HomePreplayFocusContextValue | null>(null)

/** Picks one homepage VIDEO card for mobile preplay: highest visible fraction, then closest to viewport vertical center. */
export function HomePreplayFocusProvider({ children }: { children: React.ReactNode }) {
  const scoresRef = useRef<Map<string, Score>>(new Map())
  const [focusedMediaId, setFocusedMediaId] = useState<string | null>(null)
  const rafRef = useRef<number | null>(null)

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
    () => ({ focusedMediaId, reportPreplayIntersection, unregisterPreplay }),
    [focusedMediaId, reportPreplayIntersection, unregisterPreplay]
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
