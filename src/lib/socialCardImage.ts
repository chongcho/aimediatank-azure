import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { unlink, writeFile, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getFfmpegPath } from '@/lib/mediaProcessor'
import { probeImageDimensionsFromFile } from '@/lib/socialImageDimensions'
import {
  SOCIAL_CARD_IMAGE_MAX_WIDTH,
} from '@/lib/socialCardMeta'

/** WhatsApp silently drops preview images above ~300KB (stricter than X/Facebook). */
export const SOCIAL_CARD_IMAGE_MAX_BYTES = 280_000

const SOCIAL_CARD_CACHE = 'public, max-age=86400, s-maxage=86400'

/** Max width 1200; height follows native aspect (portrait → tall card on X). */
const ASPECT_SCALE_FILTER = `scale=${SOCIAL_CARD_IMAGE_MAX_WIDTH}:-2`

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

async function renderSocialCardJpeg(
  input: Buffer,
  quality: number
): Promise<{ body: Buffer; width: number; height: number }> {
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
      ASPECT_SCALE_FILTER,
      '-frames:v',
      '1',
      '-q:v',
      String(quality),
      outPath,
    ])
    const body = await readFile(outPath)
    const dimensions = await probeImageDimensionsFromFile(outPath)
    return {
      body,
      width: dimensions?.width ?? SOCIAL_CARD_IMAGE_MAX_WIDTH,
      height: dimensions?.height ?? SOCIAL_CARD_IMAGE_MAX_WIDTH,
    }
  } finally {
    await unlink(inPath).catch(() => {})
    await unlink(outPath).catch(() => {})
  }
}

/** Scale to max width 1200 (aspect preserved) and compress for WhatsApp / strict crawlers. */
export async function optimizeSocialCardImage(
  body: ArrayBuffer,
  _contentType: string | null
): Promise<{
  body: Buffer
  contentType: string
  cacheControl: string
  width: number
  height: number
}> {
  const bytes = Buffer.from(body)
  const qualities = [5, 8, 10, 12]

  let lastError: unknown
  for (const quality of qualities) {
    try {
      const rendered = await renderSocialCardJpeg(bytes, quality)
      if (rendered.body.length <= SOCIAL_CARD_IMAGE_MAX_BYTES || quality === qualities.at(-1)) {
        return {
          body: rendered.body,
          contentType: 'image/jpeg',
          cacheControl: SOCIAL_CARD_CACHE,
          width: rendered.width,
          height: rendered.height,
        }
      }
    } catch (err) {
      lastError = err
    }
  }

  throw lastError ?? new Error('social card image optimization failed')
}
