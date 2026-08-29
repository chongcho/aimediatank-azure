export type MediaThumbnailSource = {
  type?: string | null
  thumbnailUrl?: string | null
  url?: string | null
  streamUrl?: string | null
}

/** Derive `uuid-thumb.jpg` from stream variant URLs when `thumbnailUrl` is missing. */
export function deriveVideoThumbnailFromMediaUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  const trimmed = url.trim()
  const withoutQuery = trimmed.split('?')[0]
  if (/-thumb\.jpe?g$/i.test(withoutQuery)) return trimmed
  if (!/\.(mp4|webm|mov)$/i.test(withoutQuery)) return null

  const derived = withoutQuery
    .replace(/-(?:480p|720p|1080p|hq)\.mp4$/i, '-thumb.jpg')
    .replace(/\.mp4$/i, '-thumb.jpg')
    .replace(/\.webm$/i, '-thumb.jpg')
    .replace(/\.mov$/i, '-thumb.jpg')

  return derived !== withoutQuery ? derived : null
}

export function resolveMediaThumbnailSrc(media: MediaThumbnailSource): string | null {
  const thumb = media.thumbnailUrl?.trim()
  if (thumb) return thumb
  if (media.type === 'IMAGE' && media.url?.trim()) return media.url.trim()
  if (media.type === 'VIDEO' || media.type === 'MUSIC') {
    return (
      deriveVideoThumbnailFromMediaUrl(media.streamUrl) ??
      deriveVideoThumbnailFromMediaUrl(media.url)
    )
  }
  return null
}

/** Best-effort frame from the detail-page video player. */
export function captureDetailVideoFramePreview(): string | null {
  if (typeof document === 'undefined') return null
  const video = document.querySelector(
    '.media-detail-split-player video'
  ) as HTMLVideoElement | null
  if (!video || video.readyState < 2 || !video.videoWidth) return null
  try {
    const canvas = document.createElement('canvas')
    const max = 320
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    return null
  }
}

/** Best-effort preview from the detail-page player when no static thumbnail URL exists. */
export function captureDetailMediaPreview(): string | null {
  if (typeof document === 'undefined') return null
  const img = document.querySelector('.media-detail-split-player img') as HTMLImageElement | null
  if (img?.src?.trim()) {
    if (img.complete && img.naturalWidth === 0) return captureDetailVideoFramePreview()
    return img.src.trim()
  }
  return captureDetailVideoFramePreview()
}
