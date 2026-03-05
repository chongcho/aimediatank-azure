'use client'

import { createContext, useContext, type ReactNode } from 'react'

const KakaoConfigContext = createContext<string | undefined>(undefined)

export function useKakaoJsKey() {
  return useContext(KakaoConfigContext)
}

export function KakaoConfigProvider({
  jsKey,
  children,
}: {
  jsKey: string | undefined
  children: ReactNode
}) {
  return (
    <KakaoConfigContext.Provider value={jsKey || undefined}>
      {children}
    </KakaoConfigContext.Provider>
  )
}
