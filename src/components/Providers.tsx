'use client'

import { SessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'
import { FeedCardTextModeProvider } from '@/contexts/FeedCardTextModeContext'
import { GuestGeoLocaleProvider } from '@/contexts/GuestGeoLocaleContext'
import DocumentLang from './DocumentLang'
import ServiceWorkerNavigateListener from './ServiceWorkerNavigateListener'
import SessionLocaleFromProfileSync from './SessionLocaleFromProfileSync'
import NativeShellClass from './NativeShellClass'
import NativeVoipBootstrap from './NativeVoipBootstrap'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <NativeVoipBootstrap />
      <GuestGeoLocaleProvider>
        <NativeShellClass />
        <SessionLocaleFromProfileSync />
        <ServiceWorkerNavigateListener />
        <DocumentLang />
        <FeedCardTextModeProvider>{children}</FeedCardTextModeProvider>
      </GuestGeoLocaleProvider>
    </SessionProvider>
  )
}


