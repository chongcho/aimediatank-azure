'use client'

import { SessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'
import DocumentLang from './DocumentLang'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <DocumentLang />
      {children}
    </SessionProvider>
  )
}


