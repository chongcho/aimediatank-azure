import { spawn } from 'child_process'
import { getFfprobePath } from '@/lib/mediaProcessor'

/** X large-image cards require at least 300×157; width is the usual failure mode. */
export const SOCIAL_PREVIEW_MIN_DIMENSION = 300

const TTL_MS = 86_400_000
const MAX_ENTRIES = 500
const FETCH_PREFIX_BYTES = 65_536

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

function validDimensions(width: number, height: number): { width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return null
  }
  return { width, height }
}

/** Parse width×height from JPEG/PNG/WebP file headers (no ffprobe — works on Azure). */
export function parseImageDimensionsFromBuffer(
  bytes: Buffer
): { width: number; height: number } | null {
  if (bytes.length < 24) return null

  // PNG — IHDR chunk
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return validDimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20))
  }

  // JPEG — scan for SOF markers
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i + 8 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++
        continue
      }
      const marker = bytes[i + 1]
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3) {
        return validDimensions(bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5))
      }
      if (marker === 0xd8 || marker === 0xd9) {
        i += 2
        continue
      }
      const segmentLength = bytes.readUInt16BE(i + 2)
      if (segmentLength < 2) break
      i += 2 + segmentLength
    }
  }

  // WebP — VP8X extended or VP8/VP8L bitstream header
  if (
    bytes.length >= 30 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const chunk = bytes.toString('ascii', 12, 16)
    if (chunk === 'VP8X' && bytes.length >= 30) {
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16))
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
      return validDimensions(width, height)
    }
    if (chunk === 'VP8 ' && bytes.length >= 30) {
      return validDimensions(bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff)
    }
    if (chunk === 'VP8L' && bytes.length >= 25) {
      const bits = bytes.readUInt32LE(21)
      return validDimensions(1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff))
    }
  }

  return null
}

async function fetchImagePrefix(url: string): Promise<Buffer | null> {
  try {
    const ranged = await fetch(url, {
      headers: { Range: `bytes=0-${FETCH_PREFIX_BYTES - 1}` },
      redirect: 'follow',
    })
    if (ranged.ok || ranged.status === 206) {
      const bytes = Buffer.from(await ranged.arrayBuffer())
      if (bytes.length > 0) return bytes
    }

    const full = await fetch(url, { redirect: 'follow' })
    if (!full.ok) return null
    const bytes = Buffer.from(await full.arrayBuffer())
    return bytes.subarray(0, FETCH_PREFIX_BYTES)
  } catch {
    return null
  }
}

function cacheDimensions(url: string, width: number, height: number) {
  cache.set(url, { width, height, expiresAt: Date.now() + TTL_MS })
  prune()
}

/** Read width×height from a remote image via HTTP + header parse (Azure-safe). */
export async function probeImageDimensionsFromUrl(
  url: string
): Promise<{ width: number; height: number } | null> {
  const cached = cache.get(url)
  if (cached && cached.expiresAt > Date.now()) {
    return { width: cached.width, height: cached.height }
  }

  const prefix = await fetchImagePrefix(url)
  if (prefix) {
    const parsed = parseImageDimensionsFromBuffer(prefix)
    if (parsed) {
      cacheDimensions(url, parsed.width, parsed.height)
      return parsed
    }
  }

  // Fallback when header parse fails (unusual formats)
  const ffprobe = await probeImageDimensionsFromUrlViaFfprobe(url)
  if (ffprobe) {
    cacheDimensions(url, ffprobe.width, ffprobe.height)
  }
  return ffprobe
}

function probeImageDimensionsFromUrlViaFfprobe(
  url: string
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
      resolve(validDimensions(width, height))
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
      resolve(validDimensions(width, height))
    })
  })
}

export function meetsSocialPreviewMinimum(width: number, height: number): boolean {
  return width >= SOCIAL_PREVIEW_MIN_DIMENSION && height >= SOCIAL_PREVIEW_MIN_DIMENSION
}
