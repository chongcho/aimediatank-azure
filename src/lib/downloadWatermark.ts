import { BlobServiceClient } from '@azure/storage-blob'
import { existsSync } from 'fs'
import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import { v4 as uuidv4 } from 'uuid'
import { parseBlobUrl } from '@/lib/azureBlobDelete'

const WATERMARK_TIMEOUT_MS = 10 * 60 * 1000

function getBlobService() {
  const cs = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!cs) throw new Error('AZURE_STORAGE_CONNECTION_STRING not set')
  return BlobServiceClient.fromConnectionString(cs)
}

function getFfmpegPath(): string {
  try {
    const staticPath = require('ffmpeg-static') as string | null
    if (staticPath && existsSync(staticPath)) return staticPath
  } catch {
    // fall through
  }
  return 'ffmpeg'
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = getFfmpegPath()
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }
    const timeoutId = setTimeout(() => {
      settle(() => {
        try {
          proc.kill()
        } catch {
          /* ignore */
        }
        reject(new Error('Watermark FFmpeg timed out'))
      })
    }, WATERMARK_TIMEOUT_MS)
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      clearTimeout(timeoutId)
      if (settled) return
      settle(() => {
        if (code === 0) resolve()
        else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-1500)}`))
      })
    })
    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      settle(() => reject(err))
    })
  })
}

function getDejaVuFontPathForFfmpeg(): string {
  const candidates = [
    join(process.cwd(), 'node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'),
    join(process.cwd(), 'node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p.replace(/\\/g, '/').replace(/:/g, '\\:')
  }
  return ''
}

/** Escape text for ffmpeg drawtext single-quoted string */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
    .replace(/@/g, '\\@')
}

export function buildGuestWatermarkLines(username: string): { line1: string; line2: string } {
  const safeUser = (username || 'creator').replace(/[^\w.-]/g, '_').slice(0, 40)
  return {
    line1: `Copyright@${safeUser}`,
    line2: 'Register AiMediaTank.com for no watermark',
  }
}

function buildDrawtextFilter(username: string): string {
  const fontfile = getDejaVuFontPathForFfmpeg()
  const fontOpt = fontfile ? `fontfile=${fontfile}:` : ''
  const { line1, line2 } = buildGuestWatermarkLines(username)
  return [
    `drawtext=${fontOpt}text='${escapeDrawtext(line1)}':fontsize=28:fontcolor=white@0.92:box=1:boxcolor=black@0.45:boxborderw=8:x=(w-text_w)/2:y=h-120`,
    `drawtext=${fontOpt}text='${escapeDrawtext(line2)}':fontsize=22:fontcolor=white@0.88:box=1:boxcolor=black@0.45:boxborderw=6:x=(w-text_w)/2:y=h-68`,
  ].join(',')
}

async function downloadBlobToTemp(blobUrl: string): Promise<{ inputPath: string; ext: string }> {
  const parsed = parseBlobUrl(blobUrl)
  if (!parsed) throw new Error(`Cannot parse blob URL: ${blobUrl}`)

  const blob = getBlobService()
    .getContainerClient(parsed.containerName)
    .getBlobClient(parsed.blobName)

  const dir = join(tmpdir(), 'download-watermark')
  await mkdir(dir, { recursive: true })
  const ext = parsed.blobName.split('.').pop()?.split('?')[0]?.toLowerCase() || 'mp4'
  const inputPath = join(dir, `${uuidv4()}.${ext}`)

  const downloadResponse = await blob.download(0)
  const chunks: Buffer[] = []
  for await (const chunk of downloadResponse.readableStreamBody as AsyncIterable<Buffer>) {
    chunks.push(chunk)
  }
  await writeFile(inputPath, Buffer.concat(chunks))
  return { inputPath, ext }
}

export type WatermarkedFileResult = {
  outputPath: string
  inputPath: string
  contentType: string
  ext: string
}

/**
 * Download source blob and burn guest watermark. Caller must delete inputPath + outputPath.
 */
export async function createWatermarkedDownloadFile(
  sourceBlobUrl: string,
  mediaType: string,
  username: string
): Promise<WatermarkedFileResult> {
  const { inputPath, ext: inExt } = await downloadBlobToTemp(sourceBlobUrl)
  const dir = join(tmpdir(), 'download-watermark')
  const type = mediaType.toUpperCase()
  const filter = buildDrawtextFilter(username)

  try {
    if (type === 'MUSIC') {
      const outPath = join(dir, `${uuidv4()}.${inExt || 'mp3'}`)
      const { line1, line2 } = buildGuestWatermarkLines(username)
      const meta = `${line1} — ${line2}`
      await runFfmpeg([
        '-y',
        '-i',
        inputPath,
        '-metadata',
        `comment=${meta}`,
        '-metadata',
        `copyright=${line1}`,
        '-codec',
        'copy',
        outPath,
      ])
      const contentType =
        inExt === 'wav'
          ? 'audio/wav'
          : inExt === 'm4a' || inExt === 'aac'
            ? 'audio/mp4'
            : 'audio/mpeg'
      return { outputPath: outPath, inputPath, contentType, ext: inExt || 'mp3' }
    }

    const isVideo = type === 'VIDEO'
    const outExt = isVideo ? (inExt === 'webm' ? 'mp4' : inExt || 'mp4') : inExt || 'jpg'
    const outputPath = join(dir, `${uuidv4()}.${outExt}`)

    if (isVideo) {
      await runFfmpeg([
        '-y',
        '-i',
        inputPath,
        '-vf',
        filter,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        outputPath,
      ])
      return { outputPath, inputPath, contentType: 'video/mp4', ext: outExt === 'webm' ? 'mp4' : outExt }
    }

    // IMAGE (and unknown types treated as image-like)
    await runFfmpeg(['-y', '-i', inputPath, '-vf', filter, '-q:v', '2', outputPath])
    const contentType =
      outExt === 'png'
        ? 'image/png'
        : outExt === 'webp'
          ? 'image/webp'
          : outExt === 'gif'
            ? 'image/gif'
            : 'image/jpeg'
    return { outputPath, inputPath, contentType, ext: outExt }
  } catch (e) {
    await unlink(inputPath).catch(() => {})
    throw e
  }
}

export async function cleanupWatermarkedFiles(paths: string[]): Promise<void> {
  await Promise.all(paths.map((p) => unlink(p).catch(() => {})))
}

/** Stream watermarked file as attachment response body */
export async function watermarkedDownloadResponse(
  result: WatermarkedFileResult,
  fileName: string
): Promise<Response> {
  const { outputPath, inputPath, contentType } = result
  const data = await readFile(outputPath)
  await cleanupWatermarkedFiles([outputPath, inputPath])
  return new Response(data, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
