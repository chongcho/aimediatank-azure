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
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function waitMs(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms))
  })
}

async function pickAvcCodec(
  width: number,
  height: number,
  bitrate: number,
  fps: number
): Promise<AvcPick | null> {
  if (typeof VideoEncoder === 'undefined' || !VideoEncoder.isConfigSupported) return null

  // Prefer High@L4.0 (App Store), then step down. Soft-first helps odd App Store sizes (e.g. 886×1920).
  const codecs = ['avc1.640028', 'avc1.64001F', 'avc1.4D4028', 'avc1.42E01E']
  const accelOptions: Array<HardwarePreference | undefined> = [
    'prefer-software',
    'no-preference',
    'prefer-hardware',
    undefined,
  ]

  for (const codec of codecs) {
    for (const hardwareAcceleration of accelOptions) {
      const base: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
      }
      if (hardwareAcceleration) base.hardwareAcceleration = hardwareAcceleration

      const variants: VideoEncoderConfig[] = [
        { ...base, avc: { format: 'avc' } },
        { ...base, avc: { format: 'avc' }, bitrateMode: 'constant' },
        { ...base },
      ]

      for (const config of variants) {
        try {
          const { supported } = await VideoEncoder.isConfigSupported(config)
          if (supported) return { codec, hardwareAcceleration }
        } catch {
          // try next
        }
      }
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
    bitrate,
    framerate: fps,
    avc: { format: 'avc' },
  }
  if (pick.hardwareAcceleration) base.hardwareAcceleration = pick.hardwareAcceleration

  try {
    encoder.configure({ ...base, bitrateMode: 'constant' })
  } catch {
    encoder.configure(base)
  }
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
    pcm && pcm.length >= totalSamples * channels ? pcm : new Float32Array(totalSamples * channels)
  if (!pcm || pcm.length < totalSamples * channels) {
    for (let i = 0; i < Math.min(sampleRate, pcmInterleaved.length); i++) {
      pcmInterleaved[i] = (Math.random() * 2 - 1) * 3e-5
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
  const videoBitrate = Math.round(clamp(videoBitrateMbps, 1, 50) * 1_000_000)
  const audioBitrate = Math.round(clamp(audioBitrateKbps, 64, 512) * 1000)
  const sampleRate = 48000
  const channels = 2

  const pick = await pickAvcCodec(width, height, videoBitrate, fps)
  if (!pick) {
    throw new Error(
      `No H.264 VideoEncoder config for ${width}×${height}@${fps}. Use Chrome/Edge, or check console for encoder support.`
    )
  }

  const wantAudio = await audioEncoderSupported(audioBitrate)
  const pcm = wantAudio ? await extractPcmStereo(sourceFile, startSec, endSec, sampleRate) : null

  let audioChunks: Array<{ chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }> = []
  if (wantAudio) {
    try {
      audioChunks = await encodeSilentOrPcmAac({
        pcm,
        totalSec: total,
        sampleRate,
        channels,
        bitrate: audioBitrate,
      })
    } catch (e) {
      console.warn('[crop-tool] AAC encode failed; writing video-only MP4', e)
      audioChunks = []
    }
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
  for (let i = 0; i < totalFrames; i++) {
    if (videoEncodeError) throw videoEncodeError
    const t = Math.min(startSec + i / fps, Math.max(startSec, endSec - 0.001))
    await waitForVideoSeek(video, t)
    drawFrame()

    const frame = new VideoFrame(canvas, {
      timestamp: i * frameDurationUs,
      duration: frameDurationUs,
    })
    try {
      videoEncoder.encode(frame, { keyFrame: i === 0 || i % Math.max(1, fps * 2) === 0 })
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
  return new File([target.buffer], outputBaseName.replace(/\.[^.]+$/, '') + '.mp4', {
    type: 'video/mp4',
    lastModified: Date.now(),
  })
}
