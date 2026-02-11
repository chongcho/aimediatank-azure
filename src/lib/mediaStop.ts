/**
 * Stop all video and audio playback on the page.
 * Call this before navigating away (e.g. Back button) so media does not continue in background.
 * We pause, clear src, AND call load() to fully reset the element's internal state machine.
 * Without load(), already-buffered data can fire pending events (canplay, etc.) that restart
 * playback on detached elements, causing audio to leak in the background.
 * Calling load() with no src is lightweight — it simply resets to HAVE_NOTHING state.
 */
export function stopAllMedia(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll('video, audio').forEach((el) => {
    const media = el as HTMLVideoElement | HTMLAudioElement
    try {
      if (!media.paused) media.pause()
      media.removeAttribute('src')
      media.load() // Reset internal state — cancels buffered data and pending events
    } catch {
      // ignore
    }
  })
}
