/**
 * Server-side media processing using FFmpeg.
 *
 * Lifecycle (YouTube-style):
 *   1. Client uploads raw file → Azure Blob Storage
 *   2. DB record created with processingStatus = 'pending'
 *   3. This module downloads the raw blob, transcodes via FFmpeg into multiple resolutions:
 *        - 480p, 720p, 1080p (when source is tall enough) + HQ (source)
 *        - Thumbnail (if video) → <uuid>-thumb.jpg
 *   4. MediaVersion rows created per resolution with url + fileSize; media.url = 720p, media.urlHq = HQ
 *   5. Raw blob deleted
 */

import { prisma } from '@/lib/prisma'
import { notifyUploadLiveAfterVideoProcessing } from '@/lib/deferredUploadNotifications'
import { BlobServiceClient } from '@azure/storage-blob'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFile, unlink, readFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'

// ---------------------------------------------------------------------------
// FFmpeg setup
// ---------------------------------------------------------------------------

let ffmpegPath: string | null = null

function getFfmpegPath(): string {
  if (ffmpegPath) return ffmpegPath

  try {
    // ffmpeg-static provides a path to the binary
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const staticPath = require('ffmpeg-static') as string | null
    if (staticPath && existsSync(staticPath)) {
      ffmpegPath = staticPath
      return staticPath
    }
  } catch {
    // fall through
  }

  // Fallback: assume ffmpeg is on PATH (e.g. installed via apt on Linux)
  ffmpegPath = 'ffmpeg'
  return 'ffmpeg'
}

// Max wall-clock time per FFmpeg invocation (avoid runaway transcodes; cron marks stuck after 30 min)
const FFMPEG_TIMEOUT_MS = 25 * 60 * 1000 // 25 minutes

// Run ffmpeg via child_process with a process timeout so bad/huge files don't run forever
function runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process') as typeof import('child_process')
    const bin = getFfmpegPath()
    console.log(`[MediaProcessor] Running: ${bin} ${args.join(' ')}`)

    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    let stdout = ''
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
          // ignore
        }
        reject(new Error(`FFmpeg timed out after ${FFMPEG_TIMEOUT_MS / 60000} minutes`))
      })
    }, FFMPEG_TIMEOUT_MS)

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code: number) => {
      clearTimeout(timeoutId)
      if (settled) return
      settle(() => {
        if (code === 0) {
          resolve({ stdout, stderr })
        } else {
          reject(new Error(`FFmpeg exited with code ${code}:\n${stderr.slice(-2000)}`))
        }
      })
    })

    proc.on('error', (err: Error) => {
      clearTimeout(timeoutId)
      settle(() => reject(new Error(`FFmpeg spawn error: ${err.message}`)))
    })
  })
}

// ---------------------------------------------------------------------------
// Azure Blob helpers
// ---------------------------------------------------------------------------

function getAzureBlobService() {
  const cs = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!cs) throw new Error('AZURE_STORAGE_CONNECTION_STRING not set')
  return BlobServiceClient.fromConnectionString(cs)
}

function getContainerName() {
  return process.env.AZURE_STORAGE_CONTAINER_NAME || 'media'
}

/** Parse a full blob URL into { containerName, blobName } */
function parseBlobUrl(url: string): { containerName: string; blobName: string } | null {
  try {
    const u = new URL(url)
    const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean)
    if (parts.length >= 2) return { containerName: parts[0], blobName: parts.slice(1).join('/') }
    if (parts.length === 1) return { containerName: getContainerName(), blobName: parts[0] }
    return null
  } catch {
    return null
  }
}

/** Download a blob to a local temp file and return the path */
async function downloadBlob(blobUrl: string): Promise<string> {
  const parsed = parseBlobUrl(blobUrl)
  if (!parsed) throw new Error(`Cannot parse blob URL: ${blobUrl}`)

  const blobService = getAzureBlobService()
  const container = blobService.getContainerClient(parsed.containerName)
  const blob = container.getBlobClient(parsed.blobName)

  const dir = join(tmpdir(), 'media-processor')
  if (!existsSync(dir)) await mkdir(dir, { recursive: true })

  const ext = parsed.blobName.split('.').pop() || 'mp4'
  const localPath = join(dir, `${uuidv4()}.${ext}`)

  const downloadResponse = await blob.download(0)
  const chunks: Buffer[] = []
  for await (const chunk of downloadResponse.readableStreamBody as AsyncIterable<Buffer>) {
    chunks.push(chunk)
  }
  await writeFile(localPath, Buffer.concat(chunks))

  console.log(`[MediaProcessor] Downloaded ${blobUrl} → ${localPath} (${Buffer.concat(chunks).length} bytes)`)
  return localPath
}

/** Upload a local file to Azure Blob Storage and return the public URL */
async function uploadBlob(localPath: string, blobName: string, contentType: string): Promise<string> {
  const blobService = getAzureBlobService()
  const containerName = getContainerName()
  const container = blobService.getContainerClient(containerName)
  const blockBlob = container.getBlockBlobClient(blobName)

  const data = await readFile(localPath)
  await blockBlob.upload(data, data.length, {
    blobHTTPHeaders: {
      blobContentType: contentType,
      blobCacheControl: 'public, max-age=31536000',
    },
  })

  const accountName = process.env.AZURE_STORAGE_CONNECTION_STRING?.match(/AccountName=([^;]+)/)?.[1] || ''
  const url = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}`
  console.log(`[MediaProcessor] Uploaded ${localPath} → ${url} (${data.length} bytes)`)
  return url
}

/** Delete a blob by URL */
async function deleteBlob(blobUrl: string) {
  try {
    const parsed = parseBlobUrl(blobUrl)
    if (!parsed) return
    const blobService = getAzureBlobService()
    const container = blobService.getContainerClient(parsed.containerName)
    const blob = container.getBlobClient(parsed.blobName)
    await blob.deleteIfExists()
    console.log(`[MediaProcessor] Deleted blob: ${blobUrl}`)
  } catch (e) {
    console.error(`[MediaProcessor] Failed to delete blob: ${blobUrl}`, e)
  }
}

// ---------------------------------------------------------------------------
// Probe helpers
// ---------------------------------------------------------------------------

interface ProbeResult {
  width: number
  height: number
  duration: number // seconds
  hasAudio: boolean
  /** Demuxer stream index for -map 0:N (first non–attached-pic video). */
  videoStreamIndex: number
  /** Demuxer stream index for first audio, or null. */
  audioStreamIndex: number | null
}

function pickPrimaryVideoStream(streams: any[]): any | undefined {
  const isAttachedPic = (s: any) => Number(s?.disposition?.attached_pic) === 1
  return (
    streams.find((s: any) => s.codec_type === 'video' && !isAttachedPic(s))
    || streams.find((s: any) => s.codec_type === 'video')
  )
}

async function probeVideo(filePath: string): Promise<ProbeResult> {
  const bin = getFfmpegPath()
  // Use ffprobe from same directory (ffmpeg-static ships it alongside)
  const probeBin = bin.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1')

  const { spawn } = require('child_process') as typeof import('child_process')

  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]

    const proc = spawn(existsSync(probeBin) ? probeBin : 'ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.on('close', (code: number) => {
      if (code !== 0 || !stdout) {
        resolve({
          width: 1920,
          height: 1080,
          duration: 0,
          hasAudio: false,
          videoStreamIndex: 0,
          audioStreamIndex: null,
        })
        return
      }
      try {
        const info = JSON.parse(stdout)
        const streams = info.streams || []
        const videoStream = pickPrimaryVideoStream(streams)
        const audioStream = streams.find((s: any) => s.codec_type === 'audio')
        const videoStreamIndex = Number(videoStream?.index ?? 0)
        const audioStreamIndex = audioStream != null ? Number(audioStream.index) : null
        resolve({
          width: videoStream?.width ?? 1920,
          height: videoStream?.height ?? 1080,
          duration: parseFloat(info.format?.duration || '0'),
          hasAudio: audioStream != null,
          videoStreamIndex: Number.isFinite(videoStreamIndex) ? videoStreamIndex : 0,
          audioStreamIndex: audioStreamIndex != null && Number.isFinite(audioStreamIndex) ? audioStreamIndex : null,
        })
      } catch {
        // Fallback: avoid mapping a guessed audio index that may not exist
        resolve({
          width: 1920,
          height: 1080,
          duration: 0,
          hasAudio: false,
          videoStreamIndex: 0,
          audioStreamIndex: null,
        })
      }
    })
    proc.on('error', () =>
      resolve({
        width: 1920,
        height: 1080,
        duration: 0,
        hasAudio: false,
        videoStreamIndex: 0,
        audioStreamIndex: null,
      }),
    )
  })
}

// ---------------------------------------------------------------------------
// Core transcoding
// ---------------------------------------------------------------------------

// 480p up to 1080p + HQ (source). Only encode heights <= source (no upscale).
const TARGET_HEIGHTS = [480, 720, 1080] as const

export interface VariantResult {
  label: string
  height: number
  url: string
  fileSize: number
}

interface TranscodeResult {
  variants: VariantResult[]
  url720p: string
  urlHq: string
  thumbnailUrl: string | null
}

/**
 * Transcode a video into multiple resolutions (YouTube-style) + HQ.
 * If cropData is provided, it is applied before scaling.
 * If trimData is provided, only the segment [start, end] is encoded (-ss before -i for fast seek).
 *
 * If onPreviewReady is provided, it will be called after the first playable
 * 480p variant and thumbnail are uploaded, but before higher resolutions and
 * HQ are processed. This allows the app to start playback quickly while HD
 * variants continue encoding in the background.
 */
async function transcodeVideo(
  rawLocalPath: string,
  baseBlobName: string,
  existingThumbnail: string | null,
  cropData?: { x: number; y: number; width: number; height: number },
  trimData?: { start: number; end: number },
  onPreviewReady?: (preview: VariantResult, thumbnailUrl: string | null) => Promise<void>,
): Promise<TranscodeResult> {
  const probe = await probeVideo(rawLocalPath)
  const effectiveHeight = cropData
    ? Math.min(Math.round(cropData.height), probe.height - Math.max(0, Math.round(cropData.y)))
    : probe.height
  console.log(`[MediaProcessor] Probe: ${probe.width}x${probe.height}, effective=${effectiveHeight}, audio=${probe.hasAudio}`)
  if (cropData) {
    console.log(`[MediaProcessor] Crop: x=${cropData.x}, y=${cropData.y}, w=${cropData.width}, h=${cropData.height}`)
  }
  const trimDuration = trimData && trimData.end > trimData.start ? trimData.end - trimData.start : 0
  const trimArgs = trimDuration > 0
    ? ['-ss', String(trimData!.start), '-t', String(trimDuration)]
    : []
  if (trimDuration > 0) {
    console.log(`[MediaProcessor] Trim: ${trimData!.start}s–${trimData!.end}s (${trimDuration.toFixed(1)}s)`)
  }

  const dir = join(tmpdir(), 'media-processor')

  // Crop filter for filter_complex (same clamp logic as buildVideoFilter).
  const cropFilterStr = cropData
    ? (() => {
        const cx = Math.max(0, Math.round(cropData.x))
        const cy = Math.max(0, Math.round(cropData.y))
        const cw = Math.round(cropData.width)
        const ch = Math.round(cropData.height)
        return `crop='min(${cw},in_w-${cx})':'min(${ch},in_h-${cy})':'min(${cx},in_w-1)':'min(${cy},in_h-1)'`
      })()
    : null

  const buildVideoFilter = (scaleHeight?: number): string[] => {
    const filters: string[] = []
    if (cropData && cropFilterStr) filters.push(cropFilterStr)
    if (scaleHeight) filters.push(`scale=-2:${scaleHeight}`)
    return filters.length > 0 ? ['-vf', filters.join(',')] : []
  }

  const variants: VariantResult[] = []

  // Targets: only resolutions <= effectiveHeight (no upscale).
  // Include 360p as the very first rung for even faster preview, then 480p/720p/1080p.
  const multiTargets = [
    ...(effectiveHeight >= 360 ? [360] : []),
    ...(effectiveHeight >= 480 ? [480] : []),
    ...(effectiveHeight >= 720 ? [720] : []),
    ...(effectiveHeight >= 1080 ? [1080] : []),
  ] as number[]

  let previewVariant: VariantResult | null = null

  // 1) FAST FIRST DISPLAY: Encode only the lowest resolution (360p/480p when available) and thumbnail first,
  //    then call onPreviewReady so the app can show the video while we encode the rest in the background.
  const vi = probe.videoStreamIndex
  const ai = probe.audioStreamIndex
  const isNoDecoderOrMuxError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    return /no decoder found|Invalid argument|Error (initializing|binding) filtergraph|matches no streams/i.test(msg)
  }

  const firstTarget = multiTargets[0]
  if (firstTarget !== undefined) {
    const label = firstTarget === 1080 ? '1080p' : `${firstTarget}p`
    const outPath = join(dir, `${baseBlobName}-${label}.mp4`)
    // Map only the primary video + first audio stream. `-map 0:v` maps *all* video tracks
    // (cover art, motion-photo sidecars, etc.) and can trigger "no decoder found for: none".
    const buildFirstPassArgs = (withAudio: boolean): string[] => {
      const maps: string[] = ['-map', `0:${vi}`]
      const audioOpts: string[] =
        withAudio && ai != null
          ? ['-map', `0:${ai}`, '-c:a', 'aac', '-b:a', firstTarget <= 480 ? '96k' : '128k']
          : ['-an']
      return [
        ...trimArgs,
        '-i', rawLocalPath,
        ...maps,
        '-vf', [...(cropFilterStr ? [cropFilterStr] : []), `scale=-2:${firstTarget}`].filter(Boolean).join(','),
        '-y',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', firstTarget <= 480 ? '26' : '23',
        ...audioOpts,
        '-movflags', '+faststart',
        '-max_muxing_queue_size', '1024',
        outPath,
      ]
    }
    console.log(`[MediaProcessor] Fast first-pass: ${label} only (for quick display)`)
    try {
      await runFfmpeg(buildFirstPassArgs(ai != null))
    } catch (err) {
      if (ai != null && isNoDecoderOrMuxError(err)) {
        console.log('[MediaProcessor] First pass failed with audio; retrying video-only')
        await runFfmpeg(buildFirstPassArgs(false))
      } else {
        throw err
      }
    }
    const url = await uploadBlob(outPath, `${baseBlobName}-${label}.mp4`, 'video/mp4')
    const fileSize = (await readFile(outPath)).length
    await safeUnlink(outPath)
    const v: VariantResult = { label, height: firstTarget, url, fileSize }
    variants.push(v)
    previewVariant = v
    console.log(`[MediaProcessor] ${label}: ${(fileSize / 1024 / 1024).toFixed(2)} MB`)
  }

  // 2) Thumbnail — one frame, -ss before -i for fast input seeking (quick; run right after first variant).
  let thumbnailUrl = existingThumbnail
  if (!existingThumbnail || trimDuration > 0) {
    const thumbPath = join(dir, `${baseBlobName}-thumb.jpg`)
    const seekTime = trimDuration > 0
      ? trimData!.start + Math.min(trimDuration * 0.1, 2)
      : Math.min(probe.duration * 0.1, 5)
    const thumbFilters: string[] = []
    if (cropFilterStr) thumbFilters.push(cropFilterStr)
    thumbFilters.push('scale=640:-2')
    try {
      await runFfmpeg([
        '-ss', seekTime.toString(), '-i', rawLocalPath, '-y',
        '-map', `0:${vi}`,
        '-frames:v', '1',
        '-vf', thumbFilters.join(','), '-q:v', '3', thumbPath,
      ])
      thumbnailUrl = await uploadBlob(thumbPath, `${baseBlobName}-thumb.jpg`, 'image/jpeg')
      await safeUnlink(thumbPath)
    } catch (e) {
      console.error('[MediaProcessor] Thumbnail generation failed (non-fatal):', e)
    }
  }

  // Notify app so it can show the video immediately (480p or lowest variant + thumbnail).
  if (onPreviewReady && previewVariant) {
    try {
      await onPreviewReady(previewVariant, thumbnailUrl ?? null)
    } catch (e) {
      console.error('[MediaProcessor] onPreviewReady callback failed (non-fatal):', e)
    }
  }

  // 3) Remaining resolutions (720p, 1080p) in a single pass so we don't re-encode the first target.
  const remainingTargets = multiTargets.slice(1)
  if (remainingTargets.length > 0) {
    const N = remainingTargets.length
    const vIn = `[0:${vi}]`
    const videoChain = cropFilterStr
      ? `${vIn}${cropFilterStr}[c];[c]split=${N}${remainingTargets.map((_, i) => `[v${i}]`).join('')};` +
        remainingTargets.map((h, i) => `[v${i}]scale=-2:${h}[v${h}]`).join(';')
      : `${vIn}split=${N}${remainingTargets.map((_, i) => `[v${i}]`).join('')};` +
        remainingTargets.map((h, i) => `[v${i}]scale=-2:${h}[v${h}]`).join(';')

    const runRemainingPass = (withAudio: boolean) => {
      const audioChain =
        withAudio && ai != null
          ? `;[0:${ai}]asplit=${N}${remainingTargets.map((_, i) => `[a${i}]`).join('')}`
          : ''
      const filterComplex = videoChain + audioChain
      const baseArgs: string[] = [
        ...trimArgs,
        '-i', rawLocalPath,
        '-filter_complex', filterComplex,
        '-y',
        '-max_muxing_queue_size', '1024',
      ]
      const outputArgs: string[] = []
      for (let i = 0; i < remainingTargets.length; i++) {
        const height = remainingTargets[i]
        const label = height === 1080 ? '1080p' : `${height}p`
        const outPath = join(dir, `${baseBlobName}-${label}.mp4`)
        outputArgs.push(
          '-map', `[v${height}]`,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          ...(withAudio ? ['-map', `[a${i}]`, '-c:a', 'aac', '-b:a', '128k'] : ['-an']),
          '-movflags', '+faststart',
          outPath,
        )
      }
      return runFfmpeg([...baseArgs, ...outputArgs])
    }

    const isNoAudioStreamError = (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      return /matches no streams|Error (initializing|binding) filtergraph|Invalid argument|no decoder found/i.test(
        msg,
      )
    }

    console.log(`[MediaProcessor] Single-pass encoding remaining: ${remainingTargets.join(', ')}p`)
    try {
      await runRemainingPass(ai != null)
    } catch (err) {
      if (ai != null && isNoAudioStreamError(err)) {
        console.log('[MediaProcessor] No usable audio in multi-output pass; re-encoding remaining variants without audio')
        await runRemainingPass(false)
      } else {
        throw err
      }
    }
    for (let i = 0; i < remainingTargets.length; i++) {
      const height = remainingTargets[i]
      const label = height === 1080 ? '1080p' : `${height}p`
      const outPath = join(dir, `${baseBlobName}-${label}.mp4`)
      const url = await uploadBlob(outPath, `${baseBlobName}-${label}.mp4`, 'video/mp4')
      const fileSize = (await readFile(outPath)).length
      await safeUnlink(outPath)
      variants.push({ label, height, url, fileSize })
      console.log(`[MediaProcessor] ${label}: ${(fileSize / 1024 / 1024).toFixed(2)} MB`)
    }
  }

  // 4) HQ (source resolution, high quality). Use 'medium' for balance; 'slow' was ~2–3x longer.
  const hqHeight = effectiveHeight
  const hqLabel = hqHeight >= 2160 ? '4K' : hqHeight >= 1080 ? '1080p' : hqHeight >= 720 ? '720p' : 'HQ'
  const hqPath = join(dir, `${baseBlobName}-hq.mp4`)
  const buildHqArgs = (withAudio: boolean): string[] => {
    const maps: string[] = ['-map', `0:${vi}`]
    const tail: string[] =
      withAudio && ai != null
        ? ['-map', `0:${ai}`, '-c:a', 'aac', '-b:a', '256k']
        : ['-an']
    return [
      ...trimArgs,
      '-i', rawLocalPath, '-y',
      ...maps,
      ...buildVideoFilter(),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      ...tail,
      '-movflags', '+faststart', '-max_muxing_queue_size', '1024',
      hqPath,
    ]
  }
  try {
    await runFfmpeg(buildHqArgs(ai != null))
  } catch (err) {
    if (ai != null && isNoDecoderOrMuxError(err)) {
      console.log('[MediaProcessor] HQ pass failed with audio; retrying video-only')
      await runFfmpeg(buildHqArgs(false))
    } else {
      throw err
    }
  }
  const urlHq = await uploadBlob(hqPath, `${baseBlobName}-hq.mp4`, 'video/mp4')
  const fileSizeHq = (await readFile(hqPath)).length
  await safeUnlink(hqPath)
  variants.push({ label: 'HQ', height: hqHeight, url: urlHq, fileSize: fileSizeHq })

  const url720p = variants.find(v => v.height === 720)?.url ?? variants[0]?.url ?? urlHq

  return { variants, url720p, urlHq, thumbnailUrl }
}

async function safeUnlink(p: string) {
  try { await unlink(p) } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Process a newly uploaded media file.
 * Called fire-and-forget from the upload complete API.
 *
 * For VIDEO:
 *   - Downloads raw → FFmpeg 720p + HQ → uploads → updates DB → deletes raw
 *   - If cropData is provided, applies crop during transcoding
 *
 * For IMAGE / MUSIC:
 *   - Currently no server-side processing (client-side is sufficient)
 *   - processingStatus set to 'completed' immediately
 */
export async function processMedia(
  mediaId: string,
  cropData?: { x: number; y: number; width: number; height: number },
  trimData?: { start: number; end: number },
): Promise<void> {
  console.log(`[MediaProcessor] Starting processing for media ${mediaId}`)

  try {
    // Mark as processing
    await prisma.media.update({
      where: { id: mediaId },
      data: { processingStatus: 'processing' },
    })

    // Fetch the media record
    const media = await prisma.media.findUnique({ where: { id: mediaId } })
    if (!media) {
      console.error(`[MediaProcessor] Media ${mediaId} not found`)
      return
    }

    // Only process VIDEO — images and music are already fine
    if (media.type !== 'VIDEO') {
      await prisma.media.update({
        where: { id: mediaId },
        data: { processingStatus: 'completed' },
      })
      console.log(`[MediaProcessor] Media ${mediaId} is ${media.type}, no processing needed`)
      return
    }

    const rawUrl = media.url

    // Extract base blob name (uuid without extension)
    const parsed = parseBlobUrl(rawUrl)
    if (!parsed) throw new Error(`Cannot parse raw URL: ${rawUrl}`)
    const baseName = parsed.blobName.replace(/\.[^.]+$/, '') // strip extension

    // Download raw file
    const rawLocalPath = await downloadBlob(rawUrl)

    try {
      // Transcode (with optional crop and trim) — multiple resolutions + HQ.
      // onPreviewReady allows us to expose a fast 480p preview + thumbnail
      // as soon as they are ready, while higher resolutions continue encoding.
      const result = await transcodeVideo(
        rawLocalPath,
        baseName,
        media.thumbnailUrl,
        cropData,
        trimData,
        async (preview, thumbnailUrl) => {
          try {
            await prisma.media.update({
              where: { id: mediaId },
              data: {
                url: preview.url,
                // Keep processingStatus='processing' here; we only mark
                // 'completed' after all variants are done below.
                processingStatus: 'processing',
                processingError: null,
                // Always prefer the freshly generated server-side thumbnail during processing
                ...(thumbnailUrl ? { thumbnailUrl } : {}),
              },
            })
            console.log(
              `[MediaProcessor] Preview ready for media ${mediaId}: ${preview.label} (${preview.height}p)`
            )
          } catch (e) {
            console.error('[MediaProcessor] Failed to update media with preview (non-fatal):', e)
          }
        }
      )

      // Replace any existing variants (e.g. from older pipeline) and create new ones
      await prisma.mediaVersion.deleteMany({ where: { mediaId } })
      for (const v of result.variants) {
        await prisma.mediaVersion.create({
          data: {
            mediaId,
            label: v.label,
            height: v.height,
            url: v.url,
            fileSize: BigInt(v.fileSize),
          },
        })
      }

      const hqVariant = result.variants.find(v => v.label === 'HQ')
      const updateData: any = {
        url: result.url720p,
        urlHq: result.urlHq,
        processingStatus: 'completed',
        processingError: null,
      }
      // Always use result.thumbnailUrl when present (e.g. regenerated for trim)
      if (result.thumbnailUrl) updateData.thumbnailUrl = result.thumbnailUrl
      if (hqVariant && hqVariant.fileSize > 0) updateData.fileSize = BigInt(hqVariant.fileSize)

      await prisma.media.update({
        where: { id: mediaId },
        data: updateData,
      })

      await deleteBlob(rawUrl)

      console.log(`[MediaProcessor] ✅ Media ${mediaId} processed: ${result.variants.length} versions`)

      await notifyUploadLiveAfterVideoProcessing(mediaId)
    } finally {
      // Always clean up the local raw file
      await safeUnlink(rawLocalPath)
    }
  } catch (error) {
    console.error(`[MediaProcessor] ❌ Failed to process media ${mediaId}:`, error)

    // Mark as failed so UI can show error state
    try {
      await prisma.media.update({
        where: { id: mediaId },
        data: {
          processingStatus: 'failed',
          processingError: error instanceof Error ? error.message : 'Unknown processing error',
        },
      })
    } catch (dbErr) {
      console.error('[MediaProcessor] Failed to update error status:', dbErr)
    }
  }
}
