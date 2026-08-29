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
  title: 'AI Media Tank (AMT) | AI-Generated Media Community',
  description: 'Discover and share stunning AI-generated videos, images, and music. Join our community of AI creators and enthusiasts.',
  keywords: 'AI media, AI art, AI music, AI video, AI generated content, media sharing',
  authors: [{ name: 'AI Media Tank, LLC (AMT)' }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black',
    title: 'AMT',
  },
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'AI Media Tank (AMT) | AI-Generated Media Community',
    description: 'Discover and share stunning AI-generated videos, images, and music.',
    url: 'https://aimediatank.com',
    siteName: 'AI Media Tank, LLC (AMT)',
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
        <meta name="apple-mobile-web-app-title" content="AMT" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2773919175450942"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if (window.__AIM_NATIVE_SHELL__) {
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(regs) {
                  regs.forEach(function(r) { r.unregister(); });
                });
              }
            } else if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').then(function(registration) {
                  console.log('PWA: Service Worker registered with scope:', registration.scope);
                  registration.update().catch(function() {});
                }).catch(function(err) {
                  console.log('PWA: Service Worker registration failed:', err);
                });
              });
            }
          `}
        </Script>
      </head>
      <body className="min-h-screen bg-tank-black grid-pattern m-0 p-0">
        <Script id="chunk-load-recovery" strategy="beforeInteractive">
          {`(function(){if(window.__AMT_CHUNK_RECOVERY__)return;window.__AMT_CHUNK_RECOVERY__=true;var K='amt_chunk_load_reload';function bad(m,n,f){var t=(m||'')+' '+(n||'')+' '+(f||'');return/ChunkLoadError/i.test(t)||/Loading chunk [\\w.-]+ failed/i.test(t)||/Loading CSS chunk [\\w.-]+ failed/i.test(t)||/Failed to fetch dynamically imported module/i.test(t)||/error loading dynamically imported module/i.test(t)||/Importing a module script failed/i.test(t)}function go(){try{if(sessionStorage.getItem(K)==='1')return;sessionStorage.setItem(K,'1')}catch(e){return}location.reload()}window.addEventListener('error',function(e){var t=e&&e.target;if(t&&(t.tagName==='SCRIPT'||t.tagName==='LINK')){var s=t.src||t.href||'';if(/\\/_next\\/static\\//.test(s)){go();return}}var err=e&&e.error;if(bad(e&&e.message||err&&err.message,err&&err.name,e&&e.filename))go()},true);window.addEventListener('unhandledrejection',function(e){var r=e&&e.reason;var m=typeof r==='string'?r:(r&&r.message)||String(r||'');var n=(r&&r.name)||'';if(bad(m,n))go()});window.addEventListener('load',function(){setTimeout(function(){try{sessionStorage.removeItem(K)}catch(e){}},10000)})})();`}
        </Script>
        <Script id="native-shell-boot" strategy="beforeInteractive">
          {`(function(){function d(){var c=window.Capacitor;if(c&&c.isNativePlatform&&c.isNativePlatform())return true;if(window.matchMedia('(display-mode: standalone)').matches)return false;if(window.navigator.standalone)return false;var u=navigator.userAgent;if(!/iPhone|iPod|iPad/.test(u))return false;return/AppleWebKit/.test(u)&&/Mobile\\//.test(u)&&!/Safari\\//.test(u)}function s(){if(!d())return;var r=document.documentElement,b=document.body;if(!b)return;r.classList.add('capacitor-native');b.classList.add('capacitor-native-body');var p=(window.Capacitor&&window.Capacitor.getPlatform&&window.Capacitor.getPlatform())||'ios';if(p)r.classList.add(p);var e=document.createElement('div');e.style.cssText='position:fixed;top:0;padding-top:env(safe-area-inset-top);padding-top:constant(safe-area-inset-top);visibility:hidden;pointer-events:none';b.appendChild(e);var t=parseFloat(getComputedStyle(e).paddingTop)||0;e.style.cssText='position:fixed;bottom:0;padding-bottom:env(safe-area-inset-bottom);padding-bottom:constant(safe-area-inset-bottom);visibility:hidden;pointer-events:none';var bt=parseFloat(getComputedStyle(e).paddingBottom)||0;e.remove();if(p==='ios'&&t<1)t=47;if(p==='ios'&&bt<1)bt=34;r.style.setProperty('--app-safe-top',t+'px');r.style.setProperty('--app-safe-bottom',bt+'px');window.__AIM_NATIVE_SHELL__=true}s();document.addEventListener('DOMContentLoaded',s);setTimeout(s,0);setTimeout(s,100)})();`}
        </Script>
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
            {children}
            {modal}
          </main>
          <footer className="w-full py-6 mt-8 border-t border-tank-light">
            <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
              © {new Date().getFullYear()} AI Media Tank, LLC (AMT). All rights reserved.
            </div>
          </footer>
          <InstallPrompt />
          </KakaoConfigProvider>
        </Providers>
      </body>
    </html>
  )
}
