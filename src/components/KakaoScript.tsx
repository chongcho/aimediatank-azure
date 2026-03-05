'use client'

import Script from 'next/script'

const KAKAO_SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/v2/2.7.2/kakao.min.js'

export default function KakaoScript() {
  const key = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY
  if (!key) return null

  return (
    <Script
      src={KAKAO_SDK_URL}
      crossOrigin="anonymous"
      strategy="afterInteractive"
      onLoad={() => {
        if (typeof window !== 'undefined' && (window as unknown as { Kakao?: { init: (k: string) => void } }).Kakao) {
          (window as unknown as { Kakao: { init: (k: string) => void } }).Kakao.init(key)
        }
      }}
    />
  )
}
