/**
 * Stop all video and audio playback on the page.
 * Call this before navigating away (e.g. Back button) so media does not continue in background.
 * Pause and clear src synchronously; defer load() so we don't block Back navigation (important for large videos).
 */
export function stopAllMedia(): void {
  if (typeof document === 'undefined') return
  const elements: (HTMLVideoElement | HTMLAudioElement)[] = []
  document.querySelectorAll('video, audio').forEach((el) => {
    const media = el as HTMLVideoElement | HTMLAudioElement
    try {
      if (!media.paused) media.pause()
      media.removeAttribute('src')
      elements.push(media)
    } catch {
      // ignore
    }
  })
  // Defer load() so popstate / router.back() can run without blocking (large video load() can be slow)
  if (elements.length > 0) {
    setTimeout(() => {
      elements.forEach((media) => {
        try {
          if (media.isConnected) media.load()
        } catch {
          // ignore
        }
      })
    }, 0)
  }
}
