'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const STORAGE_KEY = 'homeFeedCardTextMode'

export type FeedCardTextMode = 'original' | 'local'

/** Persist language mode before hard navigations (e.g. profile save → home). */
export function persistFeedCardTextMode(mode: FeedCardTextMode) {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(STORAGE_KEY, mode)
    }
  } catch {
    /* ignore */
  }
}

type FeedCardTextModeContextValue = {
  mode: FeedCardTextMode
  setMode: (mode: FeedCardTextMode) => void
}

const FeedCardTextModeContext = createContext<FeedCardTextModeContextValue | null>(null)

function readStoredMode(): FeedCardTextMode {
  if (typeof window === 'undefined') return 'local'
  try {
    const v = window.sessionStorage.getItem(STORAGE_KEY)
    return v === 'original' ? 'original' : 'local'
  } catch {
    return 'local'
  }
}

export function FeedCardTextModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<FeedCardTextMode>('local')

  useEffect(() => {
    setModeState(readStoredMode())
  }, [])

  const setMode = useCallback((next: FeedCardTextMode) => {
    setModeState(next)
    persistFeedCardTextMode(next)
  }, [])

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode])

  return <FeedCardTextModeContext.Provider value={value}>{children}</FeedCardTextModeContext.Provider>
}

export function useFeedCardTextMode(): FeedCardTextModeContextValue {
  const ctx = useContext(FeedCardTextModeContext)
  if (!ctx) {
    throw new Error('useFeedCardTextMode must be used within FeedCardTextModeProvider')
  }
  return ctx
}
