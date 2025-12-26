// Web Badge API utility functions for PWA app icon notifications

/**
 * Check if the Badge API is supported in the current browser
 */
export function isBadgeSupported(): boolean {
  return 'setAppBadge' in navigator && 'clearAppBadge' in navigator
}

/**
 * Set the app badge count on the PWA icon
 * @param count - The number to display on the badge. Pass 0 to show a dot without a number.
 */
export async function setAppBadge(count: number): Promise<boolean> {
  if (!isBadgeSupported()) {
    console.log('Badge API not supported')
    return false
  }

  try {
    if (count > 0) {
      await (navigator as any).setAppBadge(count)
      console.log(`App badge set to ${count}`)
    } else {
      await (navigator as any).clearAppBadge()
      console.log('App badge cleared')
    }
    return true
  } catch (error) {
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
