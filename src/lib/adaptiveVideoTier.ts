import type { VideoStreamRendition } from '@/lib/videoStreamRenditions'

/** Pick starting ladder index from Network Information API (client-only). */
export function pickInitialRenditionIndex(count: number): number {
  if (count <= 1) return 0
  const conn = (
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number } }).connection
      : undefined
  ) as { effectiveType?: string; downlink?: number } | undefined

  const eff = conn?.effectiveType
  const down = conn?.downlink

  if (eff === 'slow-2g' || eff === '2g') return 0
  if (eff === '3g') return Math.min(1, count - 1)
  if (typeof down === 'number' && down > 0 && down < 1.25) return Math.min(1, count - 1)
  if (typeof down === 'number' && down >= 12) return count - 1
  if (eff === '4g') return count - 1
  return Math.max(0, count - 2)
}

export function sortRenditions(renditions: VideoStreamRendition[]): VideoStreamRendition[] {
  return [...renditions].sort((a, b) => a.height - b.height)
}

/** Seconds of buffer ahead of playhead for the active buffered range. */
export function bufferAheadSeconds(video: HTMLVideoElement): number {
  const t = video.currentTime
  const ranges = video.buffered
  for (let i = 0; i < ranges.length; i++) {
    const start = ranges.start(i)
    const end = ranges.end(i)
    if (start <= t && t <= end) {
      return Math.max(0, end - t)
    }
  }
  return 0
}
