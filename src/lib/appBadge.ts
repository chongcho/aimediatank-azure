// Web Badge API utility functions for PWA app icon notifications

/**
 * Check if the Badge API is supported in the current browser
 */
export function isBadgeSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  return 'setAppBadge' in navigator && 'clearAppBadge' in navigator
}

/**
 * Check if the app is running as an installed PWA (standalone mode)
 */
export function isInstalledPWA(): boolean {
  if (typeof window === 'undefined') return false
  
  // Check display-mode media query
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  
  // Check iOS standalone mode
  const isIOSStandalone = (window.navigator as any).standalone === true
  
  // Check if running in window-controls-overlay mode
  const isOverlay = window.matchMedia('(display-mode: window-controls-overlay)').matches
  
  return isStandalone || isIOSStandalone || isOverlay
}

/**
 * Set the app badge count on the PWA icon
 * @param count - The number to display on the badge. Pass 0 to clear.
 */
export async function setAppBadge(count: number): Promise<boolean> {
  if (!isBadgeSupported()) {
    console.log('Badge API not supported in this browser')
    return false
  }

  try {
    if (count > 0) {
      // Set badge on navigator (works for both browser tab and PWA)
      await (navigator as any).setAppBadge(count)
      console.log(`App badge set to ${count}`)
      
      // Also try to set via service worker for better PWA support
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SET_BADGE',
          count: count
        })
      }
    } else {
      await (navigator as any).clearAppBadge()
      console.log('App badge cleared')
      
      // Clear via service worker too
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'CLEAR_BADGE'
        })
      }
    }
    return true
  } catch (error) {
    // NotAllowedError can occur if not in secure context or user denied permission
    console.error('Error setting app badge:', error)
    return false
  }
}

/**
 * Clear the app badge from the PWA icon
 */
export async function clearAppBadge(): Promise<boolean> {
  if (!isBadgeSupported()) {
    console.log('Badge API not supported')
    return false
  }

  try {
    await (navigator as any).clearAppBadge()
    console.log('App badge cleared')
    
    // Clear via service worker too
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CLEAR_BADGE'
      })
    }
    return true
  } catch (error) {
    console.error('Error clearing app badge:', error)
    return false
  }
}

/**
 * Calculate total notification count for badge display
 */
export function calculateTotalNotifications(unreadCount: number, chatInviteCount: number): number {
  return unreadCount + chatInviteCount
}

/**
 * Request notification permission (needed for badges in some browsers)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  
  try {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  } catch {
    return false
  }
}
