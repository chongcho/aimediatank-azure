import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import Providers from '@/components/Providers'
import Navbar from '@/components/Navbar'
import InstallPrompt from '@/components/InstallPrompt'
import RouteChangeMediaStopper from '@/components/RouteChangeMediaStopper'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#000000',
}

export const metadata: Metadata = {
  title: 'AiMediaTank | AI-Generated Media Community',
  description: 'Discover and share stunning AI-generated videos, images, and music. Join our community of AI creators and enthusiasts.',
  keywords: 'AI media, AI art, AI music, AI video, AI generated content, media sharing',
  authors: [{ name: 'AiMediaTank' }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black',
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
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
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
                navigator.serviceWorker.register('/sw.js').then(function(registration) {
                  console.log('PWA: Service Worker registered with scope:', registration.scope);

                  // Prompt SW to check for updates immediately (don’t wait 24h).
                  registration.update().catch(function() {});

                  // If there is already a waiting worker, activate it.
                  if (registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                  }

                  // When a new worker is found, ask it to skip waiting once installed.
                  registration.addEventListener('updatefound', function() {
                    var newWorker = registration.installing;
                    if (!newWorker) return;

                    newWorker.addEventListener('statechange', function() {
                      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                      }
                    });
                  });

                  // Reload once when controller changes so UI updates (guarded to avoid loops).
                  navigator.serviceWorker.addEventListener('controllerchange', function() {
                    try {
                      if (sessionStorage.getItem('swReloaded') === '1') return;
                      sessionStorage.setItem('swReloaded', '1');
                    } catch (e) {}
                    window.location.reload();
                  });
                }).catch(function(err) {
                  console.log('PWA: Service Worker registration failed:', err);
                });
              });
            }
          `}
        </Script>
      </head>
      <body className="min-h-screen bg-tank-black grid-pattern m-0 p-0">
        {/* Landscape mode black padding areas */}
        <div className="landscape-padding-left" aria-hidden="true" />
        <div className="landscape-padding-right" aria-hidden="true" />
        <Providers>
          <RouteChangeMediaStopper />
          <Navbar />
          <main className="pt-16 m-0 p-0">
            {children}
          </main>
          <footer className="w-full py-6 mt-8 border-t border-tank-light">
            <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
              © {new Date().getFullYear()} AiMediaTank. All Rights Reserved.
            </div>
          </footer>
          <InstallPrompt />
        </Providers>
      </body>
    </html>
  )
}
