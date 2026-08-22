/**
 * Force-disable embedded captions/subtitles (MP4 timed text, WebVTT, etc.).
 * Android Chrome surfaces these via native controls during touch/scrub — JS textTracks
 * alone is not enough; callers should also avoid native controls on touch devices.
 */

const guardedVideos = new WeakSet<HTMLVideoElement>()

export function isTouchVideoDevice(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || navigator.maxTouchPoints > 0
}

export function disableVideoTextTracks(video: HTMLVideoElement | null | undefined): () => void {
  if (!video?.textTracks || guardedVideos.has(video)) return () => {}

  guardedVideos.add(video)

  const disableAll = () => {
    video.querySelectorAll('track').forEach((el) => el.remove())
    const tracks = video.textTracks
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = 'disabled'
    }
  }

  const onAddTrack = (e: TrackEvent) => {
    if (e.track) e.track.mode = 'disabled'
    disableAll()
  }

  const onVideoEvent = () => disableAll()
  const videoEvents = [
    'loadedmetadata',
    'loadeddata',
    'canplay',
    'play',
    'seeking',
    'seeked',
    'timeupdate',
  ] as const

  disableAll()
  video.textTracks.addEventListener('addtrack', onAddTrack)
  video.textTracks.addEventListener('change', disableAll)
  for (const ev of videoEvents) {
    video.addEventListener(ev, onVideoEvent)
  }

  // Android WebView can re-enable captions when native controls scrub — keep forcing off.
  const pollOnAndroid =
    typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
      ? window.setInterval(disableAll, 200)
      : undefined

  return () => {
    guardedVideos.delete(video)
    if (pollOnAndroid !== undefined) window.clearInterval(pollOnAndroid)
    video.textTracks.removeEventListener('addtrack', onAddTrack)
    video.textTracks.removeEventListener('change', disableAll)
    for (const ev of videoEvents) {
      video.removeEventListener(ev, onVideoEvent)
    }
  }
}

/** Attach caption guard to every <video> on the page (feed cards + detail player). */
export function installVideoCaptionGuard(): () => void {
  if (typeof document === 'undefined') return () => {}

  const cleanups = new Map<HTMLVideoElement, () => void>()

  const guardVideo = (video: HTMLVideoElement) => {
    if (cleanups.has(video)) return
    cleanups.set(video, disableVideoTextTracks(video))
  }

  const unguardVideo = (video: HTMLVideoElement) => {
    cleanups.get(video)?.()
    cleanups.delete(video)
  }

  const onLoadedMetadata = (e: Event) => {
    if (e.target instanceof HTMLVideoElement) guardVideo(e.target)
  }

  document.querySelectorAll('video').forEach(guardVideo)
  document.addEventListener('loadedmetadata', onLoadedMetadata, true)

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLVideoElement) guardVideo(node)
        else if (node instanceof Element) {
          node.querySelectorAll('video').forEach(guardVideo)
        }
      })
      mutation.removedNodes.forEach((node) => {
        if (node instanceof HTMLVideoElement) unguardVideo(node)
        else if (node instanceof Element) {
          node.querySelectorAll('video').forEach(unguardVideo)
        }
      })
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    document.removeEventListener('loadedmetadata', onLoadedMetadata, true)
    cleanups.forEach((cleanup) => cleanup())
    cleanups.clear()
  }
}
