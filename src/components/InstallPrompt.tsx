'use client'

import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const PWA_APP_ID = 'aimediatank-pwa-v1'
const COOKIE_KEY = 'pwa_installed'
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 // 1 year in seconds

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function markInstalledLocally() {
  const ts = Date.now().toString()
  try { localStorage.setItem(`${PWA_APP_ID}-installed`, ts) } catch {}
  setCookie(COOKIE_KEY, ts, COOKIE_MAX_AGE)
}

async function reportInstallToServer(action: 'install' | 'uninstall' = 'install') {
  try {
    await fetch('/api/pwa/install-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
  } catch {}
}

async function checkServerInstallStatus(): Promise<boolean> {
  try {
    const res = await fetch('/api/pwa/install-status')
    if (!res.ok) return false
    const data = await res.json()
    return !!data.installed
  } catch {
    return false
  }
}

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)
  const [isAlreadyInstalled, setIsAlreadyInstalled] = useState(false)
  const [showInstalledMessage, setShowInstalledMessage] = useState(false)

  useEffect(() => {
    checkInstallationStatus()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkInstallationStatus = async () => {
    // --- Layer 1: Running inside the installed PWA (standalone / window-controls-overlay) ---
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    if (isStandalone) {
      console.log('PWA: Running in standalone mode — syncing install record')
      setIsAlreadyInstalled(true)
      markInstalledLocally()
      reportInstallToServer('install')
      return
    }

    // --- Layer 2: Cookie bridge (set by standalone sessions, survives some data-clears) ---
    if (getCookie(COOKIE_KEY)) {
      console.log('PWA: Install cookie found')
      setIsAlreadyInstalled(true)
      setShowInstalledMessage(true)
      setTimeout(() => setShowInstalledMessage(false), 3000)
      return
    }

    // --- Layer 3: localStorage flag ---
    const installRecord = localStorage.getItem(`${PWA_APP_ID}-installed`)
    if (installRecord) {
      console.log('PWA: localStorage install record found')
      setIsAlreadyInstalled(true)
      setCookie(COOKIE_KEY, installRecord, COOKIE_MAX_AGE)
      setShowInstalledMessage(true)
      setTimeout(() => setShowInstalledMessage(false), 3000)
      return
    }

    // --- Layer 4: getInstalledRelatedApps (Chrome 80+) ---
    if ('getInstalledRelatedApps' in navigator) {
      try {
        const relatedApps = await (navigator as Navigator & {
          getInstalledRelatedApps: () => Promise<Array<{ platform: string; url: string; id?: string }>>
        }).getInstalledRelatedApps()
        if (relatedApps.length > 0) {
          console.log('PWA: getInstalledRelatedApps detected install:', relatedApps)
          setIsAlreadyInstalled(true)
          markInstalledLocally()
          reportInstallToServer('install')
          return
        }
      } catch (err) {
        console.log('PWA: getInstalledRelatedApps failed:', err)
      }
    }

    // --- Layer 5: Server-side install record (logged-in users) ---
    const serverInstalled = await checkServerInstallStatus()
    if (serverInstalled) {
      console.log('PWA: Server reports app previously installed')
      setIsAlreadyInstalled(true)
      markInstalledLocally()
      setShowInstalledMessage(true)
      setTimeout(() => setShowInstalledMessage(false), 3000)
      return
    }

    // --- Check dismissal cooldown ---
    const dismissedTime = localStorage.getItem('pwa-install-dismissed-time')
    if (dismissedTime) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60 * 24)
      if (daysSinceDismissed > 7) {
        localStorage.removeItem('pwa-install-dismissed')
        localStorage.removeItem('pwa-install-dismissed-time')
      }
    }
    if (localStorage.getItem('pwa-install-dismissed')) return

    // --- Device detection ---
    const userAgent = navigator.userAgent.toLowerCase()
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent)
    const isAndroidDevice = /android/.test(userAgent)
    setIsIOS(isIOSDevice)
    setIsAndroid(isAndroidDevice)

    // --- beforeinstallprompt / appinstalled (Chromium; no absence inference — slow SW
    // or not-yet-installable sites also omit the event, which would false-positive) ---
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      console.log('PWA: beforeinstallprompt fired')
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowPrompt(true)
    }

    const handleAppInstalled = () => {
      console.log('PWA: appinstalled event — recording install')
      markInstalledLocally()
      reportInstallToServer('install')
      setIsAlreadyInstalled(true)
      setShowPrompt(false)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleAppInstalled)

    // iOS: no beforeinstallprompt exists
    if (isIOSDevice) {
      setTimeout(() => setShowPrompt(true), 2000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      console.log('PWA: User choice:', outcome)
      if (outcome === 'accepted') {
        markInstalledLocally()
        reportInstallToServer('install')
        setIsAlreadyInstalled(true)
        setShowPrompt(false)
      }
      setDeferredPrompt(null)
    }
  }

  const handleIOSInstallDone = () => {
    markInstalledLocally()
    reportInstallToServer('install')
    setIsAlreadyInstalled(true)
    setShowPrompt(false)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem('pwa-install-dismissed', 'true')
    localStorage.setItem('pwa-install-dismissed-time', Date.now().toString())
  }

  // Show brief "already installed" notification
  if (showInstalledMessage) {
    return (
      <div 
        style={{
          position: 'fixed',
          bottom: '100px',
          right: '20px',
          zIndex: 99998,
          background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
          borderRadius: '12px',
          padding: '12px 16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: 'white',
          fontSize: '14px',
          animation: 'fadeInOut 3s ease-in-out',
        }}
      >
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <span>AiMediaTank is already installed!</span>
        <style>{`
          @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(20px); }
            15% { opacity: 1; transform: translateY(0); }
            85% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-20px); }
          }
        `}</style>
      </div>
    )
  }

  if (!showPrompt || isAlreadyInstalled) return null

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
        <div style={{ marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: 'white' }}>
              Install AiMediaTank
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#888' }}>
              Get the full app experience
            </p>
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
          <div>
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
              <p style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            {/* Button for user to confirm they've installed */}
            <button
              onClick={handleIOSInstallDone}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(0, 255, 136, 0.1)',
                border: '1px solid rgba(0, 255, 136, 0.3)',
                borderRadius: '8px',
                color: '#00ff88',
                fontWeight: '600',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              I've installed the app ✓
            </button>
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
