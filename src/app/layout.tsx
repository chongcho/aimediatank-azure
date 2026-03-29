import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import Providers from '@/components/Providers'
import Navbar from '@/components/Navbar'
import InstallPrompt from '@/components/InstallPrompt'
import RouteChangeMediaStopper from '@/components/RouteChangeMediaStopper'
import ScrollbarEdgeReveal from '@/components/ScrollbarEdgeReveal'
import KakaoScript from '@/components/KakaoScript'
import { KakaoConfigProvider } from '@/components/KakaoConfigProvider'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#000000',
}

export const metadata: Metadata = {
  title: 'AI Media Tank | AI-Generated Media Community',
  description: 'Discover and share stunning AI-generated videos, images, and music. Join our community of AI creators and enthusiasts.',
  keywords: 'AI media, AI art, AI music, AI video, AI generated content, media sharing',
  authors: [{ name: 'AI Media Tank, LLC' }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black',
    title: 'AI Media Tank',
  },
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'AI Media Tank | AI-Generated Media Community',
    description: 'Discover and share stunning AI-generated videos, images, and music.',
    url: 'https://aimediatank.com',
    siteName: 'AI Media Tank, LLC',
    type: 'website',
  },
}

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="google-adsense-account" content="ca-pub-2773919175450942" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="AI Media Tank" />
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
          <KakaoConfigProvider jsKey={process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY}>
            <KakaoScript />
            <ScrollbarEdgeReveal />
          <RouteChangeMediaStopper />
          <Navbar />
          <main className="pt-16 m-0 p-0">
            {/* Inline skeleton in first HTML chunk so something paints before streamed content (reduces black screen) */}
            <div id="initial-loading" className="w-full p-0 m-0" aria-hidden="true">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 mb-8 py-2 px-4">
                <div className="h-9 w-48 rounded bg-tank-gray animate-pulse" />
                <div className="h-4 w-72 rounded bg-tank-gray animate-pulse hidden lg:block" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 px-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                  <div key={i} className="bg-tank-gray rounded-lg overflow-hidden">
                    <div className="aspect-video rounded-t-2xl bg-tank-light animate-pulse" />
                    <div className="p-4">
                      <div className="h-5 rounded bg-tank-light animate-pulse mb-2 w-3/4" />
                      <div className="h-4 rounded bg-tank-light animate-pulse w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {children}
            {modal}
          </main>
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){var m=document.querySelector('main');var l=document.getElementById('initial-loading');if(!m||!l)return;function hide(){for(var c=m.children,i=0;i<c.length;i++){if(c[i]!==l){l.style.display='none';return;}}};hide();var obs=new MutationObserver(hide);obs.observe(m,{childList:true,subtree:true});})();`,
            }}
          />
          <footer className="w-full py-6 mt-8 border-t border-tank-light">
            <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
              © {new Date().getFullYear()} AI Media Tank, LLC. All rights reserved.
            </div>
          </footer>
          <InstallPrompt />
          </KakaoConfigProvider>
        </Providers>
      </body>
    </html>
  )
}
