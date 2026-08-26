/**
 * Crop-tool video export via WebCodecs + mp4-muxer.
 * MediaRecorder cannot reliably stamp CFR / AAC on Windows Chrome — App Store rejects those files.
 */

import { ArrayBufferTarget, Muxer } from 'mp4-muxer'

export type WebCodecsEncodeOptions = {
  video: HTMLVideoElement
  canvas: HTMLCanvasElement
  drawFrame: () => void
  startSec: number
  endSec: number
  fps: number
  videoBitrateMbps: number
  audioBitrateKbps: number
  sourceFile: File
  outputBaseName: string
  onProgress: (pct: number) => void
  waitForVideoSeek: (video: HTMLVideoElement, timeSec: number) => Promise<void>
}

type HardwarePreference = 'no-preference' | 'prefer-hardware' | 'prefer-software'

type AvcPick = {
  codec: string
  hardwareAcceleration?: HardwarePreference
  /** Bitrate targets work on HW; Windows OpenH264 soft path needs quantizer. */
  rateControl: 'bitrate' | 'quantizer'
  quantizer?: number
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function waitMs(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms))
  })
}

function requestWebCodecsVideoBitrate(targetMbps: number): number {
  const t = clamp(targetMbps, 1, 50)
  // Mild over-request for hardware VBR (soft path uses quantizer instead).
  return Math.round(clamp(t * 1.15, 1, 55) * 1_000_000)
}

/**
 * Odd output widths (e.g. App Store 886×1920) make hardware H.264 accept the config
 * but ignore both bitrate and quantizer — ~3 Mbps regardless of settings.
 */
function prefersSoftwareQuantizer(width: number, height: number): boolean {
  return width % 16 !== 0 || height % 16 !== 0
}

/**
 * Map UI Mbps → H.264 QP for software OpenH264 quantizer mode.
 * Lower QP = higher quality / bitrate. UI captures are low-entropy — QP alone
 * often stalls ~3 Mbps; keyframe density (below) does most of the lifting.
 */
function qpFromTargetMbps(targetMbps: number): number {
  const t = clamp(targetMbps, 1, 50)
  // 12 Mbps → QP 1; 8 Mbps → QP 4; 4 Mbps → QP 10
  return clamp(Math.round(14 - t * 1.1), 1, 28)
}

/**
 * How often to force IDR. Flat UI previews compress to ~3 Mbps even at QP 1
 * unless GOPs are short; all-intra (every frame) is needed for high Mbps targets.
 */
function keyFrameInterval(fps: number, targetMbps: number, forceHighBitrate: boolean): number {
  if (!forceHighBitrate) return Math.max(1, Math.round(fps * 2))
  if (targetMbps >= 10) return 1
  if (targetMbps >= 6) return 2
  return Math.max(1, Math.round(fps / 2))
}

/**
 * Imperceptible luma dither so H.264 cannot collapse flat UI panels to tiny residuals.
 * Uses a tiled noise pattern (fast) instead of per-frame getImageData.
 */
function applyBitrateDither(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  targetMbps: number,
  noisePattern: CanvasPattern | null
) {
  if (!noisePattern) return
  const alpha = clamp((targetMbps - 3) / 18, 0, 0.12)
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.globalCompositeOperation = 'overlay'
  ctx.fillStyle = noisePattern
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

function createNoisePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  try {
    const tile = document.createElement('canvas')
    tile.width = 64
    tile.height = 64
    const tctx = tile.getContext('2d')
    if (!tctx) return null
    const img = tctx.createImageData(64, 64)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.floor(Math.random() * 256)
      d[i] = v
      d[i + 1] = v
      d[i + 2] = v
      d[i + 3] = 255
    }
    tctx.putImageData(img, 0, 0)
    return ctx.createPattern(tile, 'repeat')
  } catch {
    return null
  }
}

async function configSupported(config: VideoEncoderConfig): Promise<boolean> {
  try {
    const { supported } = await VideoEncoder.isConfigSupported(config)
    return !!supported
  } catch {
    return false
  }
}

async function pickAvcCodec(
  width: number,
  height: number,
  bitrate: number,
  fps: number,
  quantizer: number
): Promise<AvcPick | null> {
  if (typeof VideoEncoder === 'undefined' || !VideoEncoder.isConfigSupported) return null

  const codecs = ['avc1.640028', 'avc1.64001F', 'avc1.4D4028', 'avc1.42E01E']
  const tryQuantizerFirst = prefersSoftwareQuantizer(width, height)

  const trySoftwareQuantizer = async (): Promise<AvcPick | null> => {
    for (const codec of codecs) {
      const qConfig: VideoEncoderConfig = {
        codec,
        width,
        height,
        framerate: fps,
        bitrateMode: 'quantizer',
        hardwareAcceleration: 'prefer-software',
        avc: { format: 'avc' },
      }
      if (await configSupported(qConfig)) {
        return {
          codec,
          hardwareAcceleration: 'prefer-software',
          rateControl: 'quantizer',
          quantizer,
        }
      }
    }
    return null
  }

  const tryHardwareBitrate = async (): Promise<AvcPick | null> => {
    for (const codec of codecs) {
      for (const hardwareAcceleration of ['prefer-hardware', 'no-preference', undefined] as const) {
        const base: VideoEncoderConfig = {
          codec,
          width,
          height,
          bitrate,
          framerate: fps,
          avc: { format: 'avc' },
        }
        if (hardwareAcceleration) base.hardwareAcceleration = hardwareAcceleration
        if (await configSupported(base)) {
          return { codec, hardwareAcceleration, rateControl: 'bitrate' }
        }
      }
    }
    return null
  }

  // Odd sizes: hardware accepts config but caps ~3 Mbps and ignores quantizer — soft QP first.
  if (tryQuantizerFirst) {
    const q = await trySoftwareQuantizer()
    if (q) return q
  }

  const hw = await tryHardwareBitrate()
  if (hw) return hw

  if (!tryQuantizerFirst) {
    const q = await trySoftwareQuantizer()
    if (q) return q
  }

  // Last resort: software VBR (bitrate often ignored on Windows).
  for (const codec of codecs) {
    const soft: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
      hardwareAcceleration: 'prefer-software',
      avc: { format: 'avc' },
    }
    if (await configSupported(soft)) {
      return { codec, hardwareAcceleration: 'prefer-software', rateControl: 'bitrate' }
    }
  }

  return null
}

async function audioEncoderSupported(bitrate: number): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined' || !AudioEncoder.isConfigSupported) return false
  try {
    const { supported } = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      numberOfChannels: 2,
      sampleRate: 48000,
      bitrate,
    })
    return !!supported
  } catch {
    return false
  }
}

/** Decode source audio (if any) and return stereo float samples for [startSec, endSec). */
async function extractPcmStereo(
  sourceFile: File,
  startSec: number,
  endSec: number,
  sampleRate: number
): Promise<Float32Array | null> {
  try {
    const ctx = new AudioContext({ sampleRate })
    try {
      const raw = await sourceFile.arrayBuffer()
      const decoded = await ctx.decodeAudioData(raw.slice(0))
      const startSample = Math.max(0, Math.floor(startSec * decoded.sampleRate))
      const endSample = Math.min(decoded.length, Math.ceil(endSec * decoded.sampleRate))
      if (endSample <= startSample) return null

      const frames = endSample - startSample
      const ch0 = decoded.getChannelData(0)
      const ch1 = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : ch0

      if (decoded.sampleRate === sampleRate) {
        const out = new Float32Array(frames * 2)
        for (let i = 0; i < frames; i++) {
          out[i * 2] = ch0[startSample + i] ?? 0
          out[i * 2 + 1] = ch1[startSample + i] ?? 0
        }
        return out
      }

      const duration = frames / decoded.sampleRate
      const offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate)
      const buffer = offline.createBuffer(2, frames, decoded.sampleRate)
      buffer.copyToChannel(ch0.subarray(startSample, endSample), 0)
      buffer.copyToChannel(ch1.subarray(startSample, endSample), 1)
      const src = offline.createBufferSource()
      src.buffer = buffer
      src.connect(offline.destination)
      src.start(0)
      const rendered = await offline.startRendering()
      const r0 = rendered.getChannelData(0)
      const r1 = rendered.getChannelData(1)
      const outFrames = rendered.length
      const resampled = new Float32Array(outFrames * 2)
      for (let i = 0; i < outFrames; i++) {
        resampled[i * 2] = r0[i] ?? 0
        resampled[i * 2 + 1] = r1[i] ?? 0
      }
      return resampled
    } finally {
      await ctx.close().catch(() => {})
    }
  } catch {
    return null
  }
}

export function canUseWebCodecsVideoEncode(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
}

function configureVideoEncoder(
  encoder: VideoEncoder,
  pick: AvcPick,
  width: number,
  height: number,
  bitrate: number,
  fps: number
) {
  const base: VideoEncoderConfig = {
    codec: pick.codec,
    width,
    height,
    framerate: fps,
    avc: { format: 'avc' },
  }
  if (pick.hardwareAcceleration) base.hardwareAcceleration = pick.hardwareAcceleration

  if (pick.rateControl === 'quantizer') {
    encoder.configure({ ...base, bitrateMode: 'quantizer' })
    return
  }

  encoder.configure({ ...base, bitrate })
}

async function encodeSilentOrPcmAac(opts: {
  pcm: Float32Array | null
  totalSec: number
  sampleRate: number
  channels: number
  bitrate: number
}): Promise<Array<{ chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }>> {
  const { pcm, totalSec, sampleRate, channels, bitrate } = opts
  const chunks: Array<{ chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }> = []

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      chunks.push({ chunk, meta })
    },
    error: (e) => {
      throw e instanceof Error ? e : new Error(String(e))
    },
  })
  audioEncoder.configure({
    codec: 'mp4a.40.2',
    numberOfChannels: channels,
    sampleRate,
    bitrate,
  })

  const aacFrame = 1024
  const totalSamples = Math.max(aacFrame, Math.round(totalSec * sampleRate))
  const pcmInterleaved =
    pcm && pcm.length >= totalSamples * channels
      ? pcm
      : new Float32Array(totalSamples * channels)
  // Near-silent dither across the whole clip so AAC writes a real non-zero track
  // (empty PCM often yields a missing / 0 kbps audio stream in Properties).
  if (!pcm || pcm.length < totalSamples * channels) {
    for (let i = 0; i < pcmInterleaved.length; i++) {
      pcmInterleaved[i] = (Math.random() * 2 - 1) * 5e-5
    }
  }

  let sample = 0
  let audioTsUs = 0
  while (sample < totalSamples) {
    const frames = Math.min(aacFrame, totalSamples - sample)
    const planeSize = aacFrame
    const planar = new Float32Array(planeSize * channels)
    for (let i = 0; i < frames; i++) {
      planar[i] = pcmInterleaved[(sample + i) * 2] ?? 0
      planar[planeSize + i] = pcmInterleaved[(sample + i) * 2 + 1] ?? 0
    }
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: planeSize,
      numberOfChannels: channels,
      timestamp: audioTsUs,
      data: planar,
    })
    audioEncoder.encode(audioData)
    audioData.close()
    sample += frames
    audioTsUs += Math.round((planeSize / sampleRate) * 1_000_000)
    while (audioEncoder.encodeQueueSize > 10) await waitMs(8)
  }

  await audioEncoder.flush()
  audioEncoder.close()
  return chunks
}

/**
 * Encode cropped canvas frames to MP4 with exact CFR timestamps (+ AAC when supported).
 */
export async function encodeCroppedVideoWebCodecs(opts: WebCodecsEncodeOptions): Promise<File> {
  const {
    video,
    canvas,
    drawFrame,
    startSec,
    endSec,
    fps,
    videoBitrateMbps,
    audioBitrateKbps,
    sourceFile,
    outputBaseName,
    onProgress,
    waitForVideoSeek,
  } = opts

  const width = canvas.width
  const height = canvas.height
  if (width < 2 || height < 2 || width % 2 !== 0 || height % 2 !== 0) {
    throw new Error(`Canvas size must be even (got ${width}×${height})`)
  }

  const total = Math.max(0.1, endSec - startSec)
  const totalFrames = Math.max(1, Math.round(total * fps))
  const frameDurationUs = Math.round(1_000_000 / fps)
  const videoBitrate = requestWebCodecsVideoBitrate(videoBitrateMbps)
  const quantizer = qpFromTargetMbps(videoBitrateMbps)
  const audioBitrate = Math.round(clamp(audioBitrateKbps, 64, 512) * 1000)
  const sampleRate = 48000
  const channels = 2

  const pick = await pickAvcCodec(width, height, videoBitrate, fps, quantizer)
  if (!pick) {
    throw new Error(
      `No H.264 VideoEncoder config for ${width}×${height}@${fps}. Use Chrome/Edge, or check console for encoder support.`
    )
  }

  const forceHighBitrate = prefersSoftwareQuantizer(width, height) || videoBitrateMbps >= 8
  const kfEvery = keyFrameInterval(fps, videoBitrateMbps, forceHighBitrate)
  console.info(
    `[crop-tool] WebCodecs ${width}×${height}@${fps} target ${videoBitrateMbps} Mbps → ` +
      (pick.rateControl === 'quantizer'
        ? `software QP ${pick.quantizer} (${pick.codec})`
        : `bitrate ${(videoBitrate / 1_000_000).toFixed(2)} Mbps (${pick.codec}, ${pick.hardwareAcceleration ?? 'default'})`) +
      `, keyframe every ${kfEvery}`
  )

  const wantAudio =
    typeof AudioEncoder !== 'undefined' &&
    (await audioEncoderSupported(audioBitrate) || (await audioEncoderSupported(128_000)))
  const pcm = wantAudio ? await extractPcmStereo(sourceFile, startSec, endSec, sampleRate) : null

  let audioChunks: Array<{ chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }> = []
  if (wantAudio) {
    const aacBitrates = [audioBitrate, 192_000, 128_000]
    for (const br of aacBitrates) {
      try {
        audioChunks = await encodeSilentOrPcmAac({
          pcm,
          totalSec: total,
          sampleRate,
          channels,
          bitrate: br,
        })
        if (audioChunks.length > 0) break
      } catch (e) {
        console.warn(`[crop-tool] AAC encode failed @ ${br} bps; retrying`, e)
        audioChunks = []
      }
    }
    if (audioChunks.length === 0) {
      console.warn('[crop-tool] AAC unavailable; writing video-only MP4 (App Store may reject)')
    }
  } else {
    console.warn('[crop-tool] AudioEncoder not supported; writing video-only MP4')
  }
  const audioOk = audioChunks.length > 0

  const videoChunks: Array<{ chunk: EncodedVideoChunk; meta?: EncodedVideoChunkMetadata }> = []
  let videoEncodeError: Error | null = null
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      videoChunks.push({ chunk, meta })
    },
    error: (e) => {
      videoEncodeError = e instanceof Error ? e : new Error(String(e))
    },
  })
  configureVideoEncoder(videoEncoder, pick, width, height, videoBitrate, fps)

  onProgress(0)
  video.muted = true
  const ditherCtx =
    forceHighBitrate && videoBitrateMbps > 3
      ? (canvas.getContext('2d') as CanvasRenderingContext2D | null)
      : null
  let noisePattern = ditherCtx ? createNoisePattern(ditherCtx) : null

  for (let i = 0; i < totalFrames; i++) {
    if (videoEncodeError) throw videoEncodeError
    const t = Math.min(startSec + i / fps, Math.max(startSec, endSec - 0.001))
    await waitForVideoSeek(video, t)
    drawFrame()
    if (ditherCtx && noisePattern) {
      // New tile every few frames so consecutive frames don't share residuals.
      if (i > 0 && i % 6 === 0) {
        noisePattern = createNoisePattern(ditherCtx) ?? noisePattern
      }
      applyBitrateDither(ditherCtx, width, height, videoBitrateMbps, noisePattern)
    }

    const frame = new VideoFrame(canvas, {
      timestamp: i * frameDurationUs,
      duration: frameDurationUs,
    })
    try {
      const encodeOpts: VideoEncoderEncodeOptions = {
        keyFrame: i === 0 || i % kfEvery === 0,
      }
      if (pick.rateControl === 'quantizer' && pick.quantizer != null) {
        encodeOpts.avc = { quantizer: pick.quantizer }
      }
      videoEncoder.encode(frame, encodeOpts)
    } finally {
      frame.close()
    }

    onProgress(clamp(Math.round(((i + 1) / totalFrames) * 100), 0, 100))
    while (videoEncoder.encodeQueueSize > 8) await waitMs(8)
  }

  await videoEncoder.flush()
  if (videoEncodeError) throw videoEncodeError
  videoEncoder.close()

  if (videoChunks.length === 0) {
    throw new Error('WebCodecs produced no video frames')
  }

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: {
      codec: 'avc',
      width,
      height,
      frameRate: fps,
    },
    ...(audioOk
      ? {
          audio: {
            codec: 'aac' as const,
            numberOfChannels: channels,
            sampleRate,
          },
        }
      : {}),
    fastStart: 'in-memory',
  })

  for (const { chunk, meta } of videoChunks) {
    muxer.addVideoChunk(chunk, meta)
  }
  if (audioOk) {
    for (const { chunk, meta } of audioChunks) {
      muxer.addAudioChunk(chunk, meta)
    }
  }

  muxer.finalize()
  const outBytes = target.buffer.byteLength
  const estVideoMbps = ((outBytes * 8) / total / 1_000_000).toFixed(2)
  console.info(
    `[crop-tool] WebCodecs output ${(outBytes / 1_024 / 1_024).toFixed(2)} MB, ~${estVideoMbps} Mbps total (target ${videoBitrateMbps} Mbps)`
  )
  return new File([target.buffer], outputBaseName.replace(/\.[^.]+$/, '') + '.mp4', {
    type: 'video/mp4',
    lastModified: Date.now(),
  })
}
