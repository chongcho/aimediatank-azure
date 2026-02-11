/**
 * Stop all video and audio playback on the page.
 * Call this before navigating away (e.g. Back button) so media does not continue in background.
 * We only pause and clear src; we do not call load() so that 50MB+ buffered video does not block the main thread on teardown.
 * When the page unmounts, the elements are removed and the browser releases the buffer.
 */
export function stopAllMedia(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll('video, audio').forEach((el) => {
    const media = el as HTMLVideoElement | HTMLAudioElement
    try {
      if (!media.paused) media.pause()
      media.removeAttribute('src')
    } catch {
      // ignore
    }
  })
}
