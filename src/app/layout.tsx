import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import Providers from '@/components/Providers'
import Navbar from '@/components/Navbar'

export const metadata: Metadata = {
  title: 'AI Media Tank | AI-Generated Media Sharing Platform',
  description: 'Discover and share stunning AI-generated videos, images, and music. Join our community of AI creators and enthusiasts.',
  keywords: 'AI media, AI art, AI music, AI video, AI generated content, media sharing',
  authors: [{ name: 'AI Media Tank' }],
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'AI Media Tank | AI-Generated Media Sharing Platform',
    description: 'Discover and share stunning AI-generated videos, images, and music.',
    url: 'https://aimediatank.com',
    siteName: 'AI Media Tank',
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
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2773919175450942"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </head>
      <body className="min-h-screen bg-tank-black grid-pattern">
        <Providers>
          <Navbar />
          <main className="pt-16">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
