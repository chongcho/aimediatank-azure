/** Homepage video preplay: browsers require user activation for audible playback. */

let unlocked = false
const listeners = new Set<() => void>()

export function getHomePreplaySoundUnlocked() {
  return unlocked
}

export function unlockHomePreplaySound() {
  if (unlocked) return
  unlocked = true
  listeners.forEach((cb) => cb())
  listeners.clear()
}

export function subscribeHomePreplaySound(onUnlock: () => void) {
  if (unlocked) {
    onUnlock()
    return () => {}
  }
  listeners.add(onUnlock)
  return () => {
    listeners.delete(onUnlock)
  }
}
