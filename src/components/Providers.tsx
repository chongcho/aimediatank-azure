'use client'

import { SessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'
import DocumentLang from './DocumentLang'
import SessionLocaleFromProfileSync from './SessionLocaleFromProfileSync'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SessionLocaleFromProfileSync />
      <DocumentLang />
      {children}
    </SessionProvider>
  )
}


