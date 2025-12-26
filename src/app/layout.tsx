import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import Providers from '@/components/Providers'
import Navbar from '@/components/Navbar'
import InstallPrompt from '@/components/InstallPrompt'

export const metadata: Metadata = {
  title: 'AiMediaTank | AI-Generated Media Community',
  description: 'Discover and share stunning AI-generated videos, images, and music. Join our community of AI creators and enthusiasts.',
  keywords: 'AI media, AI art, AI music, AI video, AI generated content, media sharing',
  authors: [{ name: 'AiMediaTank' }],
  manifest: '/manifest.json',
  themeColor: '#00ff88',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'AiMediaTank',
  },
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'AiMediaTank | AI-Generated Media Community',
    description: 'Discover and share stunning AI-generated videos, images, and music.',
    url: 'https://aimediatank.com',
    siteName: 'AiMediaTank',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="google-adsense-account" content="ca-pub-2773919175450942" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="AiMediaTank" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2773919175450942"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').then(
                  function(registration) {
                    console.log('PWA: Service Worker registered with scope:', registration.scope);
                  },
                  function(err) {
                    console.log('PWA: Service Worker registration failed:', err);
                  }
                );
              });
            }
          `}
        </Script>
      </head>
      <body className="min-h-screen bg-tank-black grid-pattern">
        {/* Status bar background for PWA - covers the notch/status bar area */}
        <div 
          className="fixed top-0 left-0 right-0 bg-tank-dark z-[60]" 
          style={{ height: 'env(safe-area-inset-top, 0px)' }}
          aria-hidden="true"
        />
        <Providers>
          <Navbar />
          <main className="pt-16" style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top, 0px))' }}>
            {children}
          </main>
          <InstallPrompt />
        </Providers>
      </body>
    </html>
  )
}
