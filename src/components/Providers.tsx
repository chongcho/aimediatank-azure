'use client'

import { SessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'
import { FeedCardTextModeProvider } from '@/contexts/FeedCardTextModeContext'
import DocumentLang from './DocumentLang'
import SessionLocaleFromProfileSync from './SessionLocaleFromProfileSync'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SessionLocaleFromProfileSync />
      <DocumentLang />
      <FeedCardTextModeProvider>{children}</FeedCardTextModeProvider>
    </SessionProvider>
  )
}


