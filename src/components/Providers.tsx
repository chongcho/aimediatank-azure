'use client'

import { SessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'
import { FeedCardTextModeProvider } from '@/contexts/FeedCardTextModeContext'
import { GuestGeoLocaleProvider } from '@/contexts/GuestGeoLocaleContext'
import { SocialAgeAccessProvider } from '@/hooks/useSocialAgeAccess'
import DocumentLang from './DocumentLang'
import ChunkLoadRecovery from './ChunkLoadRecovery'
import ServiceWorkerNavigateListener from './ServiceWorkerNavigateListener'
import SessionLocaleFromProfileSync from './SessionLocaleFromProfileSync'
import NativeShellClass from './NativeShellClass'
import NativeVoipBootstrap from './NativeVoipBootstrap'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <NativeVoipBootstrap />
      <SocialAgeAccessProvider>
        <GuestGeoLocaleProvider>
          <NativeShellClass />
          <ChunkLoadRecovery />
          <SessionLocaleFromProfileSync />
          <ServiceWorkerNavigateListener />
          <DocumentLang />
          <FeedCardTextModeProvider>{children}</FeedCardTextModeProvider>
        </GuestGeoLocaleProvider>
      </SocialAgeAccessProvider>
    </SessionProvider>
  )
}


