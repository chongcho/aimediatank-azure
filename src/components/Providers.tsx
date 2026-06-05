'use client'

import { SessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'
import { FeedCardTextModeProvider } from '@/contexts/FeedCardTextModeContext'
import { GuestGeoLocaleProvider } from '@/contexts/GuestGeoLocaleContext'
import DocumentLang from './DocumentLang'
import ServiceWorkerNavigateListener from './ServiceWorkerNavigateListener'
import SessionLocaleFromProfileSync from './SessionLocaleFromProfileSync'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <GuestGeoLocaleProvider>
        <SessionLocaleFromProfileSync />
        <ServiceWorkerNavigateListener />
        <DocumentLang />
        <FeedCardTextModeProvider>{children}</FeedCardTextModeProvider>
      </GuestGeoLocaleProvider>
    </SessionProvider>
  )
}


