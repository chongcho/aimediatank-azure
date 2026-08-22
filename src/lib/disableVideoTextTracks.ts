/**
 * Force-disable embedded captions/subtitles (MP4 timed text, WebVTT, etc.).
 * Android Chrome often surfaces these when native controls appear during touch/scrub.
 */
export function disableVideoTextTracks(video: HTMLVideoElement | null | undefined): () => void {
  if (!video?.textTracks) return () => {}

  const disableAll = () => {
    const tracks = video.textTracks
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = 'disabled'
    }
  }

  const onAddTrack = (e: TrackEvent) => {
    if (e.track) e.track.mode = 'disabled'
    disableAll()
  }

  disableAll()
  video.textTracks.addEventListener('addtrack', onAddTrack)
  // Some WebViews flip mode back when controls open; keep forcing disabled.
  video.textTracks.addEventListener('change', disableAll)

  return () => {
    video.textTracks.removeEventListener('addtrack', onAddTrack)
    video.textTracks.removeEventListener('change', disableAll)
  }
}
