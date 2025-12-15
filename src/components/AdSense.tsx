'use client'

import { useEffect } from 'react'

interface AdSenseProps {
  adSlot: string
  adFormat?: 'auto' | 'fluid' | 'rectangle' | 'vertical' | 'horizontal'
  fullWidthResponsive?: boolean
  className?: string
  style?: React.CSSProperties
}

declare global {
  interface Window {
    adsbygoogle: any[]
  }
}

export default function AdSense({
  adSlot,
  adFormat = 'auto',
  fullWidthResponsive = true,
  className = '',
  style = {},
}: AdSenseProps) {
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        (window.adsbygoogle = window.adsbygoogle || []).push({})
      }
    } catch (error) {
      console.error('AdSense error:', error)
    }
  }, [])

  return (
    <div className={`adsense-container ${className}`} style={style}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', ...style }}
        data-ad-client="ca-pub-2773919175450942"
        data-ad-slot={adSlot}
        data-ad-format={adFormat}
        data-full-width-responsive={fullWidthResponsive.toString()}
      />
    </div>
  )
}

// Banner ad component for top/bottom placement
export function BannerAd({ className = '' }: { className?: string }) {
  return (
    <AdSense
      adSlot="YOUR_BANNER_AD_SLOT"
      adFormat="horizontal"
      className={`w-full ${className}`}
      style={{ minHeight: '90px' }}
    />
  )
}

// In-feed ad component for between content
export function InFeedAd({ className = '' }: { className?: string }) {
  return (
    <AdSense
      adSlot="YOUR_INFEED_AD_SLOT"
      adFormat="fluid"
      className={className}
      style={{ minHeight: '250px' }}
    />
  )
}

// Sidebar ad component
export function SidebarAd({ className = '' }: { className?: string }) {
  return (
    <AdSense
      adSlot="YOUR_SIDEBAR_AD_SLOT"
      adFormat="rectangle"
      className={className}
      style={{ minHeight: '250px', width: '300px' }}
    />
  )
}

// Auto ad - Google automatically determines placement
export function AutoAd({ className = '' }: { className?: string }) {
  return (
    <AdSense
      adSlot="YOUR_AUTO_AD_SLOT"
      adFormat="auto"
      fullWidthResponsive={true}
      className={className}
    />
  )
}

