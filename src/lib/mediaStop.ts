/**
 * Stop all video and audio playback on the page.
 * Call this before navigating away (e.g. Back button) so media does not continue in background.
 */
export function stopAllMedia(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll('video, audio').forEach((el) => {
    const media = el as HTMLVideoElement | HTMLAudioElement
    try {
      if (!media.paused) media.pause()
      media.removeAttribute('src')
      media.load()
    } catch {
      // ignore
    }
  })
}
