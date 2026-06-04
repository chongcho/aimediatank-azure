import { BlobServiceClient } from '@azure/storage-blob'
import { createRequire } from 'module'
import { existsSync } from 'fs'
import { copyFile, mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import { v4 as uuidv4 } from 'uuid'
import { parseBlobUrl } from '@/lib/azureBlobDelete'

const WATERMARK_TIMEOUT_MS = 10 * 60 * 1000
const projectRequire = createRequire(join(process.cwd(), 'package.json'))

/** Guest watermark typography (ASS Fontsize ≈ pt at PlayResY; drawtext uses same pixel size). */
const WATERMARK_FONT_SIZE = 12
const WATERMARK_FONT_COLOR = 'gray'
/** ASS PrimaryColour: gray in BGR (&H00BBGGRR). */
const WATERMARK_ASS_PRIMARY_COLOUR = '&H00808080'

const NO_AUDIO_RE =
  /matches no streams|does not contain any stream|invalid audio stream|Error (initializing|binding) filtergraph|Decoder \(aac\)|Could not find tag for codec|Output file #0 does not contain any stream|no decoder found/i

let ffmpegPathCached: string | null = null
let ffprobePathCached: string | null = null

function getBlobService() {
  const cs = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!cs) throw new Error('AZURE_STORAGE_CONNECTION_STRING not set')
  return BlobServiceClient.fromConnectionString(cs)
}

function getFfmpegPath(): string {
  if (ffmpegPathCached) return ffmpegPathCached
  try {
    const staticPath = projectRequire('ffmpeg-static') as string | null
    if (staticPath && existsSync(staticPath)) {
      ffmpegPathCached = staticPath
      return staticPath
    }
  } catch {
    // fall through
  }
  const cwd = process.cwd()
  for (const rel of ['node_modules/ffmpeg-static/ffmpeg', 'node_modules/ffmpeg-static/ffmpeg.exe']) {
    const p = join(cwd, rel)
    if (existsSync(p)) {
      ffmpegPathCached = p
      return p
    }
  }
  ffmpegPathCached = 'ffmpeg'
  return 'ffmpeg'
}

function getFfprobePath(): string {
  if (ffprobePathCached) return ffprobePathCached
  const ffmpegBin = getFfmpegPath()
  const sibling = ffmpegBin.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1')
  if (sibling !== ffmpegBin && existsSync(sibling)) {
    ffprobePathCached = sibling
    return sibling
  }
  try {
    const mod = projectRequire('ffprobe-static') as { path?: string }
    const p = mod?.path
    if (p && existsSync(p)) {
      ffprobePathCached = p
      return p
    }
  } catch {
    // optional
  }
  const cwd = process.cwd()
  const linuxProbe = join(cwd, 'node_modules/ffprobe-static/bin/linux/x64/ffprobe')
  if (existsSync(linuxProbe)) {
    ffprobePathCached = linuxProbe
    return linuxProbe
  }
  ffprobePathCached = 'ffprobe'
  return 'ffprobe'
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = getFfmpegPath()
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    let stdout = ''
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
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      clearTimeout(timeoutId)
      if (settled) return
      settle(() => {
        if (code === 0) resolve()
        else {
          const tail = (stderr + stdout).trim().slice(-1500)
          reject(
            new Error(
              `FFmpeg exited ${code} [${bin}]: ${tail || '(no output)'} | args: ${args.slice(0, 12).join(' ')}…`
            )
          )
        }
      })
    })
    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      settle(() => reject(new Error(`FFmpeg spawn error (${bin}): ${err.message}`)))
    })
  })
}

/** FFmpeg filter paths: forward slashes, escape drive colons on Windows */
function ffmpegFilterPath(absPath: string): string {
  return absPath.replace(/\\/g, '/').replace(/:/g, '\\:')
}

/** Inline drawtext literal (do not use textfile= — breaks on paths with spaces) */
function escapeDrawtextLiteral(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/@/g, '\\@')
}

function resolveWatermarkFontPath(): string {
  const cwd = process.cwd()
  const candidates = [
    join(cwd, 'public', 'fonts', 'DejaVuSans.ttf'),
    join(cwd, 'public', 'fonts', 'DejaVuSans-Bold.ttf'),
    join(cwd, 'node_modules', 'dejavu-fonts-ttf', 'ttf', 'DejaVuSans.ttf'),
    join(cwd, 'node_modules', 'dejavu-fonts-ttf', 'ttf', 'DejaVuSans-Bold.ttf'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  for (const subpath of ['dejavu-fonts-ttf/ttf/DejaVuSans.ttf', 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf']) {
    try {
      const p = projectRequire.resolve(subpath)
      if (existsSync(p)) return p
    } catch {
      // try next
    }
  }
  throw new Error(
    'DejaVu watermark font not found. Ensure public/fonts/DejaVuSans-Bold.ttf or dejavu-fonts-ttf is in the deploy bundle.'
  )
}

/** Staging diagnostics when guest watermark fails (no secrets). */
export function guestWatermarkDiagnostics(): Record<string, string | boolean> {
  const cwd = process.cwd()
  let fontPath = ''
  let fontOk = false
  try {
    fontPath = resolveWatermarkFontPath()
    fontOk = existsSync(fontPath)
  } catch (e) {
    fontPath = e instanceof Error ? e.message : String(e)
  }
  const ffmpeg = getFfmpegPath()
  const ffprobe = getFfprobePath()
  return {
    cwd,
    fontPath,
    fontOk,
    ffmpegPath: ffmpeg,
    ffmpegOk: existsSync(ffmpeg),
    ffprobePath: ffprobe,
    ffprobeOk: existsSync(ffprobe),
    publicFont: existsSync(join(cwd, 'public', 'fonts', 'DejaVuSans-Bold.ttf')),
    nodeDejaVu: existsSync(join(cwd, 'node_modules', 'dejavu-fonts-ttf', 'ttf', 'DejaVuSans-Bold.ttf')),
    site: process.env.WEBSITE_SITE_NAME || '',
  }
}

export function buildGuestWatermarkLines(username: string): { line1: string; line2: string } {
  const safeUser = (username || 'creator').replace(/[^\w.-]/g, '_').slice(0, 40)
  return {
    line1: `Copyright@${safeUser}`,
    line2: 'Register AiMediaTank.com for no watermark',
  }
}

async function ensureFontInWorkDir(workDir: string): Promise<string> {
  await mkdir(workDir, { recursive: true })
  const src = resolveWatermarkFontPath()
  const dest = join(workDir, 'DejaVuSans.ttf')
  const destSpaced = join(workDir, 'DejaVu Sans.ttf')
  if (!existsSync(dest)) await copyFile(src, dest)
  if (!existsSync(destSpaced)) await copyFile(src, destSpaced)
  return dest
}

/** drawtext filter chain (no textfile=; no color@alpha — older Linux ffmpeg-static rejects those). */
async function buildDrawtextFilter(username: string, workDir: string): Promise<string> {
  const fontPath = await ensureFontInWorkDir(workDir)
  const { line1, line2 } = buildGuestWatermarkLines(username)
  const fontOpt = `fontfile=${ffmpegFilterPath(fontPath)}:`
  const multiLine = escapeDrawtextLiteral(`${line1}\n${line2}`)
  const t = `text='${multiLine}':`
  const fs = WATERMARK_FONT_SIZE
  const fc = WATERMARK_FONT_COLOR
  return `format=yuv420p,drawtext=${fontOpt}${t}fontsize=${fs}:fontcolor=${fc}:x=(w-text_w)/2:y=(h-text_h)/2`
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}')
}

/** ASS/subtitles burn-in — works on Azure linux ffmpeg-static where drawtext often exits 8. */
async function buildAssSubtitleFilter(username: string, workDir: string): Promise<string> {
  await ensureFontInWorkDir(workDir)
  const { line1, line2 } = buildGuestWatermarkLines(username)
  const assPath = join(workDir, `${uuidv4()}.ass`)
  const assText = `${escapeAssText(line1)}\\N${escapeAssText(line2)}`
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: W,DejaVu Sans,${WATERMARK_FONT_SIZE},${WATERMARK_ASS_PRIMARY_COLOUR},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,0,0,0,5,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,99:00:00.00,W,,0,0,0,,${assText}
`
  await writeFile(assPath, ass, 'utf8')
  const fontsDir = ffmpegFilterPath(workDir)
  const assFile = ffmpegFilterPath(assPath)
  return `subtitles=${assFile}:fontsdir=${fontsDir}`
}

async function buildVideoWatermarkFilter(username: string, workDir: string): Promise<string> {
  if (process.platform === 'linux') {
    return buildAssSubtitleFilter(username, workDir)
  }
  return buildDrawtextFilter(username, workDir)
}

async function buildImageWatermarkFilter(username: string, workDir: string): Promise<string> {
  return buildDrawtextFilter(username, workDir)
}

interface StreamProbe {
  videoStreamIndex: number
  audioStreamIndex: number | null
}

function pickPrimaryVideoStream(streams: { codec_type?: string; disposition?: { attached_pic?: number }; index?: number }[]) {
  const isAttachedPic = (s: { disposition?: { attached_pic?: number } }) => Number(s?.disposition?.attached_pic) === 1
  return (
    streams.find((s) => s.codec_type === 'video' && !isAttachedPic(s)) ||
    streams.find((s) => s.codec_type === 'video')
  )
}

async function probeMediaStreams(filePath: string): Promise<StreamProbe> {
  const probeBin = getFfprobePath()
  return new Promise((resolve) => {
    const args = ['-v', 'quiet', '-print_format', 'json', '-show_streams', filePath]
    const proc = spawn(probeBin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    proc.on('close', (code) => {
      if (code !== 0 || !stdout) {
        resolve({ videoStreamIndex: 0, audioStreamIndex: null })
        return
      }
      try {
        const info = JSON.parse(stdout) as { streams?: { codec_type?: string; index?: number; disposition?: { attached_pic?: number } }[] }
        const streams = info.streams || []
        const videoStream = pickPrimaryVideoStream(streams)
        const audioStream = streams.find((s) => s.codec_type === 'audio')
        const videoStreamIndex = Number(videoStream?.index ?? 0)
        const audioStreamIndex = audioStream != null ? Number(audioStream.index) : null
        resolve({
          videoStreamIndex: Number.isFinite(videoStreamIndex) ? videoStreamIndex : 0,
          audioStreamIndex:
            audioStreamIndex != null && Number.isFinite(audioStreamIndex) ? audioStreamIndex : null,
        })
      } catch {
        resolve({ videoStreamIndex: 0, audioStreamIndex: null })
      }
    })
    proc.on('error', () => resolve({ videoStreamIndex: 0, audioStreamIndex: null }))
  })
}

async function runVideoWatermark(inputPath: string, outputPath: string, vf: string): Promise<void> {
  const { audioStreamIndex: ai } = await probeMediaStreams(inputPath)
  const buildArgs = (withAudio: boolean): string[] => {
    const audioOpts: string[] =
      withAudio && ai != null
        ? ['-c:a', 'aac', '-b:a', '128k']
        : ['-an']
    return [
      '-y',
      '-i',
      inputPath,
      '-vf',
      vf,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '23',
      ...audioOpts,
      '-movflags',
      '+faststart',
      '-max_muxing_queue_size',
      '1024',
      outputPath,
    ]
  }
  try {
    await runFfmpeg(buildArgs(ai != null))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (ai != null && NO_AUDIO_RE.test(msg)) {
      await runFfmpeg(buildArgs(false))
      return
    }
    throw err
  }
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
  const body = Buffer.concat(chunks)
  if (body.length === 0) throw new Error('Downloaded blob is empty')
  await writeFile(inputPath, body)
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
  const filter =
    type === 'VIDEO'
      ? await buildVideoWatermarkFilter(username, dir)
      : await buildImageWatermarkFilter(username, dir)

  try {
    if (type === 'MUSIC') {
      const outPath = join(dir, `${uuidv4()}.${inExt || 'mp3'}`)
      const { line1, line2 } = buildGuestWatermarkLines(username)
      await runFfmpeg([
        '-y',
        '-i',
        inputPath,
        '-metadata',
        `comment=${line1} - ${line2}`,
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
      await runVideoWatermark(inputPath, outputPath, filter)
      return { outputPath, inputPath, contentType: 'video/mp4', ext: outExt === 'webm' ? 'mp4' : outExt }
    }

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
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}
