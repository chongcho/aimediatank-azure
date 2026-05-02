/**
 * Build the progressive MP4 URL ladder for streaming (same entitlement rules as
 * streamUrl). Used for adaptive playback: client picks a tier from network +
 * buffer health, then may switch src among these renditions.
 */

export type VideoStreamRendition = { height: number; url: string }

export type VideoStreamSelection = {
  streamUrl: string | null
  /** Unique URLs, ascending height (low → high). */
  streamRenditions: VideoStreamRendition[]
}

function uniqueByUrlAscending(renditions: VideoStreamRendition[]): VideoStreamRendition[] {
  const byUrl = new Map<string, VideoStreamRendition>()
  for (const r of renditions) {
    if (!r.url) continue
    const existing = byUrl.get(r.url)
    if (!existing || r.height < existing.height) {
      byUrl.set(r.url, r)
    }
  }
  return Array.from(byUrl.values()).sort((a, b) => a.height - b.height)
}

export function selectVideoStreams(params: {
  versions: { url: string; height: number }[]
  mediaUrl: string
  urlHq: string | null | undefined
  isOwnerOrPurchased: boolean
  paidQuality: string
  freeStreamMaxHeight: number
}): VideoStreamSelection {
  const { mediaUrl, urlHq, isOwnerOrPurchased, paidQuality, freeStreamMaxHeight } = params
  const versions = [...params.versions].sort((a, b) => a.height - b.height)

  if (!mediaUrl) {
    return { streamUrl: null, streamRenditions: [] }
  }

  const cap = Math.max(480, freeStreamMaxHeight)

  if (!isOwnerOrPurchased) {
    const allowed = versions.filter((v) => v.height <= cap)
    const renditions = uniqueByUrlAscending(allowed.map((v) => ({ height: v.height, url: v.url })))
    const streamUrl = allowed.length ? allowed[allowed.length - 1].url : mediaUrl
    if (renditions.length === 0) {
      return { streamUrl, streamRenditions: [{ height: Math.min(cap, 720), url: mediaUrl }] }
    }
    return { streamUrl, streamRenditions: renditions }
  }

  const pq = paidQuality || 'hq'

  if (pq === 'hq') {
    const base = versions.map((v) => ({ height: v.height, url: v.url }))
    const maxH = versions.length ? Math.max(...versions.map((v) => v.height)) : 0
    if (urlHq && !base.some((r) => r.url === urlHq)) {
      base.push({ height: maxH + 1000, url: urlHq })
    }
    const renditions = uniqueByUrlAscending(base)
    const last = versions[versions.length - 1]
    const streamUrl = urlHq || last?.url || mediaUrl
    if (renditions.length === 0) {
      return { streamUrl, streamRenditions: [{ height: 720, url: streamUrl }] }
    }
    return { streamUrl, streamRenditions: renditions }
  }

  if (pq === '1080p') {
    const allowed = versions.filter((v) => v.height <= 1080)
    const renditions = uniqueByUrlAscending(allowed.map((v) => ({ height: v.height, url: v.url })))
    const v1080 = versions.find((v) => v.height === 1080)
    const streamUrl = v1080?.url ?? urlHq ?? lastUrl(versions) ?? mediaUrl
    if (renditions.length === 0) {
      return { streamUrl, streamRenditions: [{ height: 1080, url: streamUrl }] }
    }
    return { streamUrl, streamRenditions: renditions }
  }

  // paid cap: 720p
  const allowed = versions.filter((v) => v.height <= 720)
  const renditions = uniqueByUrlAscending(allowed.map((v) => ({ height: v.height, url: v.url })))
  const v720 = versions.find((v) => v.height === 720)
  const streamUrl = v720?.url ?? mediaUrl
  if (renditions.length === 0) {
    return { streamUrl, streamRenditions: [{ height: 720, url: streamUrl }] }
  }
  return { streamUrl, streamRenditions: renditions }
}

function lastUrl(versions: { url: string; height: number }[]): string | undefined {
  if (!versions.length) return undefined
  return versions[versions.length - 1].url
}
