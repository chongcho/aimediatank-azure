import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { unlink, writeFile, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getFfmpegPath } from '@/lib/mediaProcessor'

/** WhatsApp silently drops preview images above ~300KB (stricter than X/Facebook). */
export const SOCIAL_CARD_IMAGE_MAX_BYTES = 280_000

const SOCIAL_CARD_CACHE = 'public, max-age=86400, s-maxage=86400'

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(getFfmpegPath(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`))
    })
  })
}

async function compressWithFfmpeg(input: Buffer, scale: number, quality: number): Promise<Buffer> {
  const id = randomUUID()
  const inPath = join(tmpdir(), `amt-card-in-${id}`)
  const outPath = join(tmpdir(), `amt-card-out-${id}.jpg`)
  try {
    await writeFile(inPath, input)
    await runFfmpeg([
      '-y',
      '-i',
      inPath,
      '-vf',
      `scale='min(${scale},iw)':-2`,
      '-frames:v',
      '1',
      '-q:v',
      String(quality),
      outPath,
    ])
    return await readFile(outPath)
  } finally {
    await unlink(inPath).catch(() => {})
    await unlink(outPath).catch(() => {})
  }
}

/** Resize/compress large thumbnails so WhatsApp and other strict crawlers accept them. */
export async function optimizeSocialCardImage(
  body: ArrayBuffer,
  contentType: string | null
): Promise<{ body: Buffer; contentType: string; cacheControl: string }> {
  const bytes = Buffer.from(body)
  const normalizedType = (contentType || 'image/jpeg').split(';')[0].trim().toLowerCase()

  if (
    bytes.length <= SOCIAL_CARD_IMAGE_MAX_BYTES &&
    normalizedType.startsWith('image/') &&
    normalizedType !== 'image/gif' &&
    normalizedType !== 'image/svg+xml'
  ) {
    return {
      body: bytes,
      contentType: normalizedType,
      cacheControl: SOCIAL_CARD_CACHE,
    }
  }

  try {
    let compressed = await compressWithFfmpeg(bytes, 1200, 5)
    if (compressed.length > SOCIAL_CARD_IMAGE_MAX_BYTES) {
      compressed = await compressWithFfmpeg(bytes, 800, 8)
    }
    if (compressed.length > SOCIAL_CARD_IMAGE_MAX_BYTES) {
      compressed = await compressWithFfmpeg(bytes, 600, 10)
    }
    return {
      body: compressed,
      contentType: 'image/jpeg',
      cacheControl: SOCIAL_CARD_CACHE,
    }
  } catch {
    if (bytes.length <= 600_000 && normalizedType.startsWith('image/')) {
      return {
        body: bytes,
        contentType: normalizedType,
        cacheControl: SOCIAL_CARD_CACHE,
      }
    }
    throw new Error('social card image optimization failed')
  }
}
