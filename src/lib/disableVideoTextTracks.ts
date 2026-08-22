/**
 * Force-disable embedded captions/subtitles (MP4 timed text, WebVTT, etc.).
 * Android Chrome surfaces these via native controls during touch/scrub — JS textTracks
 * alone is not enough; callers should also avoid native controls on mobile.
 */
export function disableVideoTextTracks(video: HTMLVideoElement | null | undefined): () => void {
  if (!video?.textTracks) return () => {}

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
  const videoEvents = ['loadedmetadata', 'loadeddata', 'canplay', 'play', 'seeking', 'seeked'] as const

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
    if (pollOnAndroid !== undefined) window.clearInterval(pollOnAndroid)
    video.textTracks.removeEventListener('addtrack', onAddTrack)
    video.textTracks.removeEventListener('change', disableAll)
    for (const ev of videoEvents) {
      video.removeEventListener(ev, onVideoEvent)
    }
  }
}
