import { spawn } from 'child_process'
import { getFfprobePath } from '@/lib/mediaProcessor'

/** X large-image cards require at least 300×157; width is the usual failure mode. */
export const SOCIAL_PREVIEW_MIN_DIMENSION = 300

const TTL_MS = 86_400_000
const MAX_ENTRIES = 500

interface Entry {
  width: number
  height: number
  expiresAt: number
}

const cache = new Map<string, Entry>()

function prune(now = Date.now()) {
  for (const [key, entry] of Array.from(cache.entries())) {
    if (entry.expiresAt <= now) cache.delete(key)
  }
  if (cache.size <= MAX_ENTRIES) return
  const oldest = Array.from(cache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt)
  for (const [key] of oldest) {
    if (cache.size <= MAX_ENTRIES) break
    cache.delete(key)
  }
}

/** Read width×height from a remote image (JPEG/PNG/WebP) via ffprobe. */
export async function probeImageDimensionsFromUrl(
  url: string
): Promise<{ width: number; height: number } | null> {
  const cached = cache.get(url)
  if (cached && cached.expiresAt > Date.now()) {
    return { width: cached.width, height: cached.height }
  }

  return new Promise((resolve) => {
    const child = spawn(
      getFfprobePath(),
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0:s=x',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )

    let stdout = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.on('error', () => resolve(null))
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(null)
        return
      }
      const match = stdout.trim().match(/^(\d+)x(\d+)$/)
      if (!match) {
        resolve(null)
        return
      }
      const width = Number.parseInt(match[1], 10)
      const height = Number.parseInt(match[2], 10)
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
        resolve(null)
        return
      }
      cache.set(url, { width, height, expiresAt: Date.now() + TTL_MS })
      prune()
      resolve({ width, height })
    })
  })
}

/** Read width×height from a local image file via ffprobe. */
export async function probeImageDimensionsFromFile(
  filePath: string
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const child = spawn(
      getFfprobePath(),
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0:s=x',
        filePath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )

    let stdout = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.on('error', () => resolve(null))
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(null)
        return
      }
      const match = stdout.trim().match(/^(\d+)x(\d+)$/)
      if (!match) {
        resolve(null)
        return
      }
      const width = Number.parseInt(match[1], 10)
      const height = Number.parseInt(match[2], 10)
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
        resolve(null)
        return
      }
      resolve({ width, height })
    })
  })
}

export function meetsSocialPreviewMinimum(width: number, height: number): boolean {
  return width >= SOCIAL_PREVIEW_MIN_DIMENSION && height >= SOCIAL_PREVIEW_MIN_DIMENSION
}
