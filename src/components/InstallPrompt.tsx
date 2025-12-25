'use client'

import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)
  const [browser, setBrowser] = useState('')

  useEffect(() => {
    // Check if already installed or dismissed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const isDismissed = localStorage.getItem('pwa-install-dismissed')
    const dismissedTime = localStorage.getItem('pwa-install-dismissed-time')
    
    // Show again after 7 days
    if (dismissedTime) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60 * 24)
      if (daysSinceDismissed > 7) {
        localStorage.removeItem('pwa-install-dismissed')
        localStorage.removeItem('pwa-install-dismissed-time')
      }
    }

    if (isStandalone || isDismissed) {
      return
    }

    // Detect device and browser
    const userAgent = navigator.userAgent.toLowerCase()
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent)
    const isAndroidDevice = /android/.test(userAgent)
    
    setIsIOS(isIOSDevice)
    setIsAndroid(isAndroidDevice)

    // Detect browser
    if (userAgent.includes('edg')) {
      setBrowser('edge')
    } else if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
      setBrowser('chrome')
    } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
      setBrowser('safari')
    } else if (userAgent.includes('firefox')) {
      setBrowser('firefox')
    }

    // Listen for beforeinstallprompt (Chrome/Edge on Android)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    // Show prompt for iOS (no beforeinstallprompt event)
    if (isIOSDevice) {
      setTimeout(() => setShowPrompt(true), 2000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setShowPrompt(false)
      }
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem('pwa-install-dismissed', 'true')
    localStorage.setItem('pwa-install-dismissed-time', Date.now().toString())
  }

  if (!showPrompt) return null

  return (
    <div 
      style={{
        position: 'fixed',
        top: '50%',
        right: '20px',
        transform: 'translateY(-50%)',
        zIndex: 99998,
        width: '320px',
        maxWidth: '90%',
      }}
    >
      <div 
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          borderRadius: '16px',
          padding: '16px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(0, 255, 136, 0.2)',
        }}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'transparent',
            border: 'none',
            color: '#888',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '4px',
            lineHeight: 1,
          }}
        >
          ×
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #00ff88, #10b981)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#0a0a0b' }}>Ai</span>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: 'white' }}>
              Install AiMediaTank
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#888' }}>
              Get the full app experience
            </p>
          </div>
        </div>

        {/* Instructions based on device/browser */}
        {deferredPrompt ? (
          // Android Chrome/Edge - can trigger install directly
          <button
            onClick={handleInstall}
            style={{
              width: '100%',
              padding: '12px',
              background: 'linear-gradient(135deg, #00ff88, #10b981)',
              border: 'none',
              borderRadius: '10px',
              color: '#0a0a0b',
              fontWeight: 'bold',
              fontSize: '15px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            Install App
          </button>
        ) : isIOS ? (
          // iOS instructions
          <div style={{ fontSize: '13px', color: '#ccc', lineHeight: 1.5 }}>
            <p style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                background: '#333', 
                borderRadius: '6px', 
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 'bold',
              }}>1</span>
              Tap the <strong style={{ color: '#00ff88' }}>Share</strong> button
              <svg width="18" height="18" fill="#00ff88" viewBox="0 0 24 24">
                <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V10c0-1.1.9-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .9 2 2z"/>
              </svg>
            </p>
            <p style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                background: '#333', 
                borderRadius: '6px', 
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 'bold',
              }}>2</span>
              Scroll & tap <strong style={{ color: '#00ff88' }}>"Add to Home Screen"</strong>
            </p>
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                background: '#333', 
                borderRadius: '6px', 
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 'bold',
              }}>3</span>
              Tap <strong style={{ color: '#00ff88' }}>"Add"</strong> to install
            </p>
          </div>
        ) : isAndroid ? (
          // Android (non-Chrome) instructions
          <div style={{ fontSize: '13px', color: '#ccc', lineHeight: 1.5 }}>
            <p style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                background: '#333', 
                borderRadius: '6px', 
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 'bold',
              }}>1</span>
              Tap the <strong style={{ color: '#00ff88' }}>Menu</strong> (⋮)
            </p>
            <p style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                background: '#333', 
                borderRadius: '6px', 
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 'bold',
              }}>2</span>
              Tap <strong style={{ color: '#00ff88' }}>"Add to Home Screen"</strong>
            </p>
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                background: '#333', 
                borderRadius: '6px', 
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 'bold',
              }}>3</span>
              Tap <strong style={{ color: '#00ff88' }}>"Install"</strong>
            </p>
          </div>
        ) : null}

        {/* Benefits */}
        <div style={{ 
          marginTop: '12px', 
          paddingTop: '12px', 
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          gap: '12px',
          fontSize: '11px',
          color: '#888',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <svg width="14" height="14" fill="#00ff88" viewBox="0 0 24 24">
              <path d="M13 2.05v2.02c3.95.49 7 3.85 7 7.93 0 3.21-1.92 6-4.72 7.28L13 17v5h5l-1.22-1.22C19.91 19.07 22 15.76 22 12c0-5.18-3.95-9.45-9-9.95zM11 2.05C5.94 2.55 2 6.81 2 12c0 3.76 2.09 7.07 5.22 8.78L6 22h5v-5l-2.28 2.28C6.92 18 5 15.21 5 12c0-4.08 3.05-7.44 7-7.93V2.05z"/>
            </svg>
            Faster
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <svg width="14" height="14" fill="#00ff88" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            Offline
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <svg width="14" height="14" fill="#00ff88" viewBox="0 0 24 24">
              <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/>
            </svg>
            Full Screen
          </span>
        </div>
      </div>
    </div>
  )
}

