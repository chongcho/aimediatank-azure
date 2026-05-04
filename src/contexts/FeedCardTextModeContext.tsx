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
    try {
      window.sessionStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
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
