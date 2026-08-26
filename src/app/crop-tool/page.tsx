'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { compressImage, type QualitySettings } from '@/lib/mediaCompression'
import {
  getMetaAiWatermarkOutputRect,
  getMetaAiWatermarkRectInVideoSpace,
  META_AI_WATERMARK_VISIBLE_SEC_DEFAULT,
  type MetaAiWatermarkCorner,
} from '@/lib/metaAiWatermark'
import {
  applyPrivacyMasksAfterDraw,
  collectPrivacyRectsNative,
  getCroppedOutputMaskRects,
  preloadPrivacyModels,
  type PrivacyMaskStyle,
} from '@/lib/privacyMask'
import {
  canUseWebCodecsVideoEncode,
  encodeCroppedVideoWebCodecs,
} from '@/lib/cropToolWebCodecsEncode'

type Area = { x: number; y: number; width: number; height: number }

type RenderBox = {
  width: number
  height: number
  offsetX: number
  offsetY: number
}

type CropToolSettingsFromApi = {
  isEnabled: boolean
  imageQuality: number
  videoBitrateMbps: number
  videoFps: number
  audioBitrateKbps: number
  freeImageQuality: number
  freeVideoBitrateMbps: number
  freeVideoFps: number
  freeAudioBitrateKbps: number
  freeStreamMaxHeight?: number
  freeDownloadMaxHeight?: number
  paidDownloadQuality?: string
  maxUploadSizeMb?: number
}

type OriginalVideoInfo = {
  width: number
  height: number
  durationSec: number
  fileSizeBytes: number
  mime: string
  approxOverallBitrateKbps: number | null
}

const minCropSize = 80
const CANVAS_MAX_DIM = 8192
const CROP_ZOOM_MIN = 1
const CROP_ZOOM_MAX = 5
const CROP_ZOOM_STEP = 0.1

const IDB_DB_NAME = 'aimediatank-crop-tool'
const IDB_STORE_NAME = 'outputs'

type CropOutputResolution =
  | 'auto'
  | 'hq'
  | '360'
  | '480'
  | '720'
  | '1080'

// Used for dimensions (width/height): keep at least 2px to avoid encoder/canvas issues.
function roundEvenDim(n: number) {
  return Math.max(2, Math.round(n / 2) * 2)
}

// Used for coordinates (x/y): do NOT clamp away from 0; only round to even pixels.
function roundEvenCoord(n: number) {
  return Math.round(n / 2) * 2
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/**
 * Browser MediaRecorder (esp. Windows H.264) treats videoBitsPerSecond as a soft
 * hint and often snaps to coarse ladders — e.g. request 19.5M → ~10M avg, 20M → ~13M.
 * Over-request so the UI target Mbps is more likely to land near the average.
 */
function requestVideoBitsPerSecond(targetMbps: number): number {
  const t = clamp(targetMbps, 1, 50)
  let requestMbps = t * 1.7
  // Mid targets need to clear the common ~20 Mbps request floor on Chrome/Edge.
  if (t >= 8 && t <= 14) {
    requestMbps = Math.max(requestMbps, 20.5)
  } else if (t > 14 && t < 20) {
    requestMbps = Math.max(requestMbps, t + 2)
  }
  return Math.round(clamp(requestMbps, 1, 55) * 1_000_000)
}

/** Prefer H.264 MP4 (High Profile Level 4.0 when supported); WebM only if MP4 is unavailable. */
function pickExportMimeType(): string {
  // avc1.640028 = High Profile, Level 4.0; mp4a.40.2 = AAC-LC
  const preferred = [
    'video/mp4;codecs="avc1.640028,mp4a.40.2"',
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs="avc1.640028"',
    'video/mp4;codecs=avc1.640028',
    'video/mp4;codecs="avc1.4D4028,mp4a.40.2"',
    'video/mp4;codecs="avc1.4D401E,mp4a.40.2"',
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  return preferred.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm'
}

/** True when the source element appears to have a real audio stream (not silent mux). */
function videoElementHasAudio(video: HTMLVideoElement): boolean {
  const anyV = video as HTMLVideoElement & {
    mozHasAudio?: boolean
    webkitAudioDecodedByteCount?: number
    audioTracks?: { length: number }
  }
  // Avoid captureStream() — many silent files still expose empty audio tracks.
  if (typeof anyV.mozHasAudio === 'boolean') return anyV.mozHasAudio
  if (typeof anyV.webkitAudioDecodedByteCount === 'number') {
    return anyV.webkitAudioDecodedByteCount > 0
  }
  if (anyV.audioTracks && typeof anyV.audioTracks.length === 'number') {
    return anyV.audioTracks.length > 0
  }
  return false
}

/**
 * Near-silent stereo track so MP4 exports include real AAC (App Store wants an audio track).
 * Gain must be > 0 or MediaRecorder often writes 0 kbps / empty audio.
 */
function attachSilentAudioTrack(
  stream: MediaStream
): { audioCtx: AudioContext; oscillator: OscillatorNode } | null {
  try {
    const AudioContextCtor =
      (window.AudioContext || (window as any).webkitAudioContext) as
        | (new (opts?: AudioContextOptions) => AudioContext)
        | undefined
    if (!AudioContextCtor) return null
    const audioCtx = new AudioContextCtor({ sampleRate: 48000 })
    const dest = audioCtx.createMediaStreamDestination()
    const oscillator = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    // ~−80 dB — inaudible, but enough energy for AAC to encode a non-zero bitrate.
    oscillator.frequency.value = 20
    gain.gain.value = 0.0001
    oscillator.connect(gain)
    gain.connect(dest)
    oscillator.start()
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
    return { audioCtx, oscillator }
  } catch {
    return null
  }
}

function waitForVideoSeek(video: HTMLVideoElement, timeSec: number, timeoutMs = 8000): Promise<void> {
  const target = clamp(timeSec, 0, Math.max(0, (video.duration || timeSec) - 0.001))
  if (Math.abs(video.currentTime - target) < 0.002 && video.readyState >= 2) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      video.removeEventListener('seeked', onSeeked)
      reject(new Error('Video seek timed out'))
    }, timeoutMs)
    const onSeeked = () => {
      window.clearTimeout(timeoutId)
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    try {
      video.currentTime = target
    } catch (e) {
      window.clearTimeout(timeoutId)
      video.removeEventListener('seeked', onSeeked)
      reject(e instanceof Error ? e : new Error('Video seek failed'))
    }
  })
}

/** Map UI crop coordinates (from preview metadata) to the encoding video's pixel space. */
function normalizeCropForVideoSpace(
  crop: Area,
  uiMediaSize: { width: number; height: number },
  videoW: number,
  videoH: number
): Area {
  if (videoW <= 0 || videoH <= 0) return crop
  if (videoW === uiMediaSize.width && videoH === uiMediaSize.height) return crop

  const scaleX = videoW / uiMediaSize.width
  const scaleY = videoH / uiMediaSize.height
  return {
    x: crop.x * scaleX,
    y: crop.y * scaleY,
    width: crop.width * scaleX,
    height: crop.height * scaleY,
  }
}

function formatTimeSec(t: number) {
  if (!Number.isFinite(t) || t < 0) return '0:00:00'
  const totalSeconds = Math.floor(t)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function parseTrimTime(str: string): number | null {
  const t = str.trim().replace(/,/g, '.')
  if (t === '' || /^\d+(\.\d+)?$/.test(t)) {
    const n = parseFloat(t || '0')
    return Number.isNaN(n) ? null : Math.max(0, n)
  }
  const parts = t.split(':').map((p) => parseFloat(p.trim()))
  if (parts.some(Number.isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1) return parts[0]
  return null
}

function TrimStepButton({
  direction,
  label,
  onStep,
}: {
  direction: 'up' | 'down'
  label: string
  onStep: () => void
}) {
  return (
    <button
      type="button"
      aria-label={direction === 'up' ? `Increase ${label}` : `Decrease ${label}`}
      onClick={onStep}
      className="flex flex-1 min-h-[22px] w-9 items-center justify-center text-gray-500 hover:bg-gray-100 active:bg-gray-200 touch-manipulation"
    >
      <svg viewBox="0 0 10 6" className="h-1.5 w-2.5" fill="currentColor" aria-hidden>
        {direction === 'up' ? <path d="M5 0 10 6H0z" /> : <path d="M0 0h10l-5 6z" />}
      </svg>
    </button>
  )
}

function TrimTimeField({
  label,
  seconds,
  draft,
  setDraft,
  onCommit,
  onStep,
}: {
  label: string
  seconds: number
  draft: string | null
  setDraft: (value: string | null) => void
  onCommit: (seconds: number) => void
  onStep: (delta: number) => void
}) {
  return (
    <div>
      <label className="text-sm text-gray-300">{label}</label>
      <div className="mt-1 flex overflow-hidden rounded border border-tank-light bg-tank-gray">
        <input
          type="text"
          placeholder="h:mm:ss"
          value={draft ?? formatTimeSec(seconds)}
          onFocus={() => setDraft(formatTimeSec(seconds))}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => {
            const sec = parseTrimTime(e.target.value)
            if (sec != null) onCommit(sec)
            setDraft(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-white tabular-nums focus:outline-none focus:ring-0"
        />
        <div className="flex shrink-0 flex-col border-l border-tank-light bg-white">
          <TrimStepButton direction="up" label={label} onStep={() => onStep(1)} />
          <div className="h-px bg-tank-light" />
          <TrimStepButton direction="down" label={label} onStep={() => onStep(-1)} />
        </div>
      </div>
    </div>
  )
}

export default function CropToolPage() {
  const { data: session } = useSession()

  const [navbarEnabled, setNavbarEnabled] = useState(true)

  const isAdmin = session?.user?.role === 'ADMIN'
  /** Subscribers follow navbar visibility; admins can always use standalone (e.g. from Admin panel). */
  const standaloneCropAllowed = navbarEnabled || isAdmin

  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null)
  const [mediaSize, setMediaSize] = useState<{ width: number; height: number } | null>(null)
  const [renderBox, setRenderBox] = useState<RenderBox | null>(null)
  const [cropInsets, setCropInsets] = useState({ top: 0, right: 0, bottom: 0, left: 0 })
  const [cropArea, setCropArea] = useState<Area | null>(null)
  const [cropRatio, setCropRatio] = useState<string>('free')
  const [customRatioWidth, setCustomRatioWidth] = useState(16)
  const [customRatioHeight, setCustomRatioHeight] = useState(9)
  /** Digital zoom into the crop: 1 = largest frame at current aspect, higher = tighter crop. */
  const [cropZoom, setCropZoom] = useState(CROP_ZOOM_MIN)

  const [videoDuration, setVideoDuration] = useState(0)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [trimStartInput, setTrimStartInput] = useState<string | null>(null)
  const [trimEndInput, setTrimEndInput] = useState<string | null>(null)

  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const [qualitySettings, setQualitySettings] = useState<QualitySettings>({})
  const [cropSettings, setCropSettings] = useState<CropToolSettingsFromApi | null>(null)

  const [outputResolution, setOutputResolution] = useState<CropOutputResolution>('auto')

  const [originalVideoInfo, setOriginalVideoInfo] = useState<OriginalVideoInfo | null>(null)
  // Client-side encoding overrides (user-selected).
  const [userVideoFps, setUserVideoFps] = useState<number>(30)
  const [userVideoBitrateMbps, setUserVideoBitrateMbps] = useState<number>(8)
  const [userAudioBitrateKbps, setUserAudioBitrateKbps] = useState<number>(256)

  const [privacyMaskFaces, setPrivacyMaskFaces] = useState(false)
  const [privacyMaskPlates, setPrivacyMaskPlates] = useState(false)
  const [privacyMaskStyle, setPrivacyMaskStyle] = useState<PrivacyMaskStyle>('blur')
  const [previewPrivacyFaces, setPreviewPrivacyFaces] = useState<
    Array<{ x: number; y: number; width: number; height: number }>
  >([])
  const [previewPrivacyPlates, setPreviewPrivacyPlates] = useState<
    Array<{ x: number; y: number; width: number; height: number }>
  >([])

  const [removeMetaAiWatermark, setRemoveMetaAiWatermark] = useState(false)
  const [metaAiWatermarkVisibleSec, setMetaAiWatermarkVisibleSec] = useState(
    META_AI_WATERMARK_VISIBLE_SEC_DEFAULT
  )
  const [metaAiWatermarkCorner, setMetaAiWatermarkCorner] = useState<MetaAiWatermarkCorner>('bottom-left')

  const [lastSavedName, setLastSavedName] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const visualRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null)
  const previewVideoRef = useRef<HTMLVideoElement | null>(null)
  const previewObjectUrlRef = useRef<string | null>(null)
  const selectedFileRef = useRef<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewTime, setPreviewTime] = useState(0)
  const previewPlaybackTimerRef = useRef<number | null>(null)

  const dragRef = useRef<{
    active: boolean
    startX: number
    startY: number
    startTop: number
    startLeft: number
  }>({ active: false, startX: 0, startY: 0, startTop: 0, startLeft: 0 })
  /** Crop size at Zoom 1×; zoom shrinks from this frame toward its center. */
  const zoomBaseCropRef = useRef<Area | null>(null)

  // Check navbar control toggle for crop tool.
  useEffect(() => {
    fetch('/api/ui/navbar', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        const item = data?.items?.find((i: any) => i.itemKey === 'cropTool')
        setNavbarEnabled(item?.isEnabled !== false)
      })
      .catch(() => setNavbarEnabled(true))
  }, [])

  // Load crop tool settings (quality + free/paid caps).
  useEffect(() => {
    fetch('/api/ui/crop-settings')
      .then((res) => res.json())
      .then((data) => {
        const settings = data?.settings as CropToolSettingsFromApi | undefined
        if (!settings) return
        setCropSettings(settings)
        // Upload & Download → "Crop/Re-encoding" only gates /upload, not this standalone page.

        const isSubscriber =
          !session?.user?.accountDeactivated &&
          (session?.user?.role === 'SUBSCRIBER' || session?.user?.role === 'ADMIN')

        setQualitySettings(
          isSubscriber
            ? {
                imageQuality: settings.imageQuality,
                videoBitrateMbps: settings.videoBitrateMbps,
                videoFps: settings.videoFps,
                audioBitrateKbps: settings.audioBitrateKbps,
              }
            : {
                imageQuality: settings.freeImageQuality,
                videoBitrateMbps: settings.freeVideoBitrateMbps,
                videoFps: settings.freeVideoFps,
                audioBitrateKbps: settings.freeAudioBitrateKbps,
              }
        )
      })
      .catch(() => {})
    // We intentionally want settings to refresh when subscription changes.
  }, [session?.user?.role, session?.user?.accountDeactivated])

  // Initialize user-selected encoding overrides from admin settings.
  useEffect(() => {
    if (mediaType !== 'video') return
    setUserVideoFps(qualitySettings.videoFps ?? 30)
    setUserVideoBitrateMbps(qualitySettings.videoBitrateMbps ?? 8)
    setUserAudioBitrateKbps(qualitySettings.audioBitrateKbps ?? 256)
  }, [qualitySettings, mediaType])

  // Revoke preview blob URLs to avoid memory leaks.
  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current)
      previewObjectUrlRef.current = null
    }
  }, [])

  // Cleanup trim-preview playback timer on unmount.
  useEffect(() => {
    return () => {
      if (previewPlaybackTimerRef.current != null) {
        clearInterval(previewPlaybackTimerRef.current)
        previewPlaybackTimerRef.current = null
      }
    }
  }, [])

  const resetCropWorkspace = useCallback(() => {
    setError('')
    setFile(null)
    selectedFileRef.current = null
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current)
      previewObjectUrlRef.current = null
    }
    setPreviewUrl(null)
    setMediaType(null)
    setMediaSize(null)
    setRenderBox(null)
    setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 })
    setCropArea(null)
    setCropRatio('free')
    setVideoDuration(0)
    setTrimStart(0)
    setTrimEnd(0)
    setTrimStartInput(null)
    setTrimEndInput(null)
    setProcessing(false)
    setProgress(0)
    setOutputResolution('auto')
    setOriginalVideoInfo(null)
    setLastSavedName(null)
    setPrivacyMaskFaces(false)
    setPrivacyMaskPlates(false)
    setPrivacyMaskStyle('blur')
    setPreviewPrivacyFaces([])
    setPreviewPrivacyPlates([])
    setRemoveMetaAiWatermark(false)
    setMetaAiWatermarkVisibleSec(META_AI_WATERMARK_VISIBLE_SEC_DEFAULT)
    setMetaAiWatermarkCorner('bottom-left')
    setPreviewPlaying(false)
    setPreviewTime(0)
    try {
      previewVideoRef.current?.pause()
    } catch {
      // ignore
    }
    dragRef.current.active = false
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  // BFCache restore (Back/Forward) can resurrect a half-torn-down crop session; reset the UI.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) resetCropWorkspace()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [resetCropWorkspace])

  const isSubscriber = useMemo(
    () =>
      !session?.user?.accountDeactivated &&
      (session?.user?.role === 'SUBSCRIBER' || session?.user?.role === 'ADMIN'),
    [session?.user?.role, session?.user?.accountDeactivated],
  )

  const effectiveAutoCapHeight = useMemo(() => {
    if (!cropSettings) return 720
    if (!isSubscriber) return cropSettings.freeDownloadMaxHeight ?? cropSettings.freeStreamMaxHeight ?? 720

    const q = cropSettings.paidDownloadQuality ?? 'hq'
    if (q === '720p') return 720
    if (q === '1080p') return 1080
    // 'hq' => allow auto to use full crop size (still clamped to canvas max)
    return Number.POSITIVE_INFINITY
  }, [cropSettings, isSubscriber])

  const resolutionOptions = useMemo(() => {
    if (!cropSettings) return [{ value: 'auto' as const, label: 'Auto (fit)' }]

    const maxH = isSubscriber ? effectiveAutoCapHeight : effectiveAutoCapHeight
    const canHQ = isSubscriber && (cropSettings.paidDownloadQuality ?? 'hq') === 'hq'

    const items: Array<{ value: CropOutputResolution; label: string }> = [
      { value: 'auto', label: 'Auto (fit crop)' },
    ]

    const candidates: Array<{ value: CropOutputResolution; label: string; h: number }> = [
      { value: '360', label: '360p', h: 360 },
      { value: '480', label: '480p', h: 480 },
      { value: '720', label: '720p', h: 720 },
      { value: '1080', label: '1080p', h: 1080 },
    ]

    for (const c of candidates) {
      if (!Number.isFinite(maxH) || (maxH as number) >= c.h) items.push({ value: c.value, label: c.label })
    }

    if (canHQ) items.push({ value: 'hq', label: 'HQ (source crop)' })

    return items
  }, [cropSettings, isSubscriber, effectiveAutoCapHeight])

  const previewMetaAiWatermarkRect = useMemo(() => {
    if (!removeMetaAiWatermark || mediaType !== 'video' || !mediaSize) return null
    return getMetaAiWatermarkRectInVideoSpace(mediaSize.width, mediaSize.height, metaAiWatermarkCorner)
  }, [removeMetaAiWatermark, mediaType, mediaSize, metaAiWatermarkCorner])

  const showMetaAiWatermarkPreview =
    removeMetaAiWatermark && previewTime < metaAiWatermarkVisibleSec && previewMetaAiWatermarkRect != null

  // Keep crop area consistent with insets and min crop size.
  useEffect(() => {
    if (!mediaSize) return

    const left = Math.min(Math.max(0, cropInsets.left), Math.max(0, mediaSize.width - minCropSize - cropInsets.right))
    const right = Math.min(Math.max(0, cropInsets.right), Math.max(0, mediaSize.width - minCropSize - left))
    const top = Math.min(Math.max(0, cropInsets.top), Math.max(0, mediaSize.height - minCropSize - cropInsets.bottom))
    const bottom = Math.min(Math.max(0, cropInsets.bottom), Math.max(0, mediaSize.height - minCropSize - top))

    const nextArea = {
      x: left,
      y: top,
      width: Math.max(minCropSize, mediaSize.width - left - right),
      height: Math.max(minCropSize, mediaSize.height - top - bottom),
    }
    setCropArea(nextArea)
    if (cropZoom <= CROP_ZOOM_MIN + 1e-6) {
      zoomBaseCropRef.current = nextArea
    }
  }, [cropInsets, mediaSize, cropZoom])

  const updateRenderBox = () => {
    const container = containerRef.current
    const naturalW = mediaSize?.width
    const naturalH = mediaSize?.height
    if (!container || !naturalW || !naturalH) return

    const rect = container.getBoundingClientRect()

    // Compute the exact object-fit "contain" rendering box within the container.
    // We intentionally do NOT subtract any "controls reserve" here, because the
    // <video> element still renders pixels into the full area; the browser UI
    // overlays on top of it. This makes the crop rectangle align to the full
    // original media frame.
    const scale = Math.min(rect.width / naturalW, rect.height / naturalH)

    const width = naturalW * scale
    const height = naturalH * scale

    setRenderBox({
      width,
      height,
      offsetX: (rect.width - width) / 2,
      offsetY: (rect.height - height) / 2,
    })
  }

  useEffect(() => {
    if (!previewUrl || !mediaSize) return
    updateRenderBox()
    const c = containerRef.current
    if (!c) return

    const ro = new ResizeObserver(() => updateRenderBox())
    ro.observe(c)
    return () => ro.disconnect()
  }, [previewUrl, mediaSize, mediaType])

  const effectiveTrimEnd = Math.max(trimStart + 0.01, trimEnd || videoDuration || trimStart + 0.01)

  const stepTrimStart = (delta: number) => {
    setTrimStartInput(null)
    const v = clamp(Math.floor(trimStart) + delta, 0, Math.max(0, Math.floor(trimEnd) - 1))
    setTrimStart(v)
    if (trimEnd <= v) setTrimEnd(v + 1)
  }

  const stepTrimEnd = (delta: number) => {
    setTrimEndInput(null)
    setTrimEnd(clamp(Math.floor(trimEnd) + delta, Math.floor(trimStart) + 1, Math.floor(videoDuration)))
  }

  // Drive custom trim-preview playback progress.
  useEffect(() => {
    if (!previewPlaying) return
    const v = previewVideoRef.current
    if (!v) {
      setPreviewPlaying(false)
      return
    }

    // Clamp playback time to the selected trim range.
    const nextStart = clamp(v.currentTime || trimStart, trimStart, effectiveTrimEnd)
    if (Math.abs(v.currentTime - nextStart) > 0.02) v.currentTime = nextStart

    const tick = () => {
      const vv = previewVideoRef.current
      if (!vv) return
      const t = vv.currentTime
      setPreviewTime(t)

      if (t >= effectiveTrimEnd - 0.01 || t >= (videoDuration || effectiveTrimEnd) - 0.01) {
        try {
          vv.pause()
        } catch {}
        setPreviewPlaying(false)
      }
    }

    tick()
    previewPlaybackTimerRef.current = window.setInterval(tick, 100)

    return () => {
      if (previewPlaybackTimerRef.current != null) {
        clearInterval(previewPlaybackTimerRef.current)
        previewPlaybackTimerRef.current = null
      }
    }
  }, [previewPlaying, trimStart, effectiveTrimEnd, videoDuration])

  // If user adjusts trim start/end while preview is open, keep the playhead clamped.
  useEffect(() => {
    const v = previewVideoRef.current
    if (!v) return
    const end = effectiveTrimEnd
    if (v.currentTime < trimStart) {
      v.currentTime = trimStart
      setPreviewTime(trimStart)
    } else if (v.currentTime > end) {
      v.currentTime = end
      setPreviewTime(end)
      if (previewPlaying) {
        try {
          v.pause()
        } catch {}
        setPreviewPlaying(false)
      }
    } else {
      setPreviewTime(v.currentTime)
    }
  }, [trimStart, effectiveTrimEnd, previewPlaying])

  // Approximate face / vehicle-band overlay on the trim preview (video only).
  useEffect(() => {
    if (mediaType !== 'video' || !mediaSize) {
      setPreviewPrivacyFaces([])
      setPreviewPrivacyPlates([])
      return
    }
    if (!privacyMaskFaces && !privacyMaskPlates) {
      setPreviewPrivacyFaces([])
      setPreviewPrivacyPlates([])
      return
    }

    let cancelled = false
    const run = () => {
      const v = previewVideoRef.current
      if (!v || v.readyState < 2 || !v.videoWidth) return

      void (async () => {
        try {
          await preloadPrivacyModels({
            maskFaces: privacyMaskFaces,
            maskPlates: privacyMaskPlates,
            style: privacyMaskStyle,
          })
          const { faces, plates } = await collectPrivacyRectsNative(v, {
            maskFaces: privacyMaskFaces,
            maskPlates: privacyMaskPlates,
          })
          if (!cancelled) {
            setPreviewPrivacyFaces(faces)
            setPreviewPrivacyPlates(plates)
          }
        } catch {
          if (!cancelled) {
            setPreviewPrivacyFaces([])
            setPreviewPrivacyPlates([])
          }
        }
      })()
    }

    run()
    const id = window.setInterval(run, 750)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [mediaType, mediaSize, privacyMaskFaces, privacyMaskPlates, privacyMaskStyle, previewUrl])

  useEffect(() => {
    const move = (clientX: number, clientY: number) => {
      if (!dragRef.current.active || !mediaSize || !cropArea || !renderBox) return

      const scaleX = renderBox.width / mediaSize.width
      const scaleY = renderBox.height / mediaSize.height
      if (!scaleX || !scaleY) return

      const dx = (clientX - dragRef.current.startX) / scaleX
      const dy = (clientY - dragRef.current.startY) / scaleY

      const maxLeft = mediaSize.width - cropArea.width
      const maxTop = mediaSize.height - cropArea.height
      const nextLeft = Math.min(Math.max(0, dragRef.current.startLeft + dx), maxLeft)
      const nextTop = Math.min(Math.max(0, dragRef.current.startTop + dy), maxTop)

      const right = mediaSize.width - cropArea.width - nextLeft
      const bottom = mediaSize.height - cropArea.height - nextTop

      setCropInsets({
        top: Math.round(nextTop),
        right: Math.round(right),
        bottom: Math.round(bottom),
        left: Math.round(nextLeft),
      })
    }

    const onMouseMove = (e: MouseEvent) => move(e.clientX, e.clientY)
    const onTouchMove = (e: TouchEvent) => {
      if (!dragRef.current.active) return
      e.preventDefault()
      move(e.touches[0].clientX, e.touches[0].clientY)
    }

    const end = () => {
      dragRef.current.active = false
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', end)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', end)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', end)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', end)
    }
  }, [mediaSize, cropArea, renderBox])

  const applyRatioFromValues = (widthUnits: number, heightUnits: number) => {
    if (!mediaSize || widthUnits <= 0 || heightUnits <= 0) return
    const R = widthUnits / heightUnits

    let width = mediaSize.width
    let height = Math.round(width / R)
    if (height > mediaSize.height) {
      height = mediaSize.height
      width = Math.round(height * R)
    }

    const left = Math.round((mediaSize.width - width) / 2)
    const top = Math.round((mediaSize.height - height) / 2)

    setCropZoom(CROP_ZOOM_MIN)
    zoomBaseCropRef.current = { x: left, y: top, width, height }
    setCropInsets({
      left,
      right: mediaSize.width - width - left,
      top,
      bottom: mediaSize.height - height - top,
    })
  }

  const applyRatio = (ratio: string, customW = customRatioWidth, customH = customRatioHeight) => {
    if (!mediaSize || ratio === 'free') return
    if (ratio === 'custom') {
      applyRatioFromValues(customW, customH)
      return
    }
    const [n, d] = ratio.split(':').map(Number)
    if (!n || !d) return
    applyRatioFromValues(n, d)
  }

  /**
   * Zoom into the subject by shrinking the crop toward its center while keeping aspect.
   * 1× = the current framed crop; higher values tighten that frame.
   */
  const applyCropZoom = useCallback(
    (nextZoom: number) => {
      if (!mediaSize || !cropArea) return
      const zoom = clamp(Number(nextZoom.toFixed(1)), CROP_ZOOM_MIN, CROP_ZOOM_MAX)
      const base = zoomBaseCropRef.current ?? cropArea
      if (!base.width || !base.height) return

      const aspect = base.width / base.height
      const targetW = Math.max(minCropSize, Math.round(base.width / zoom))
      const targetH = Math.max(minCropSize, Math.round(targetW / aspect))

      const centerX = cropArea.x + cropArea.width / 2
      const centerY = cropArea.y + cropArea.height / 2
      let left = Math.round(centerX - targetW / 2)
      let top = Math.round(centerY - targetH / 2)
      left = clamp(left, 0, Math.max(0, mediaSize.width - targetW))
      top = clamp(top, 0, Math.max(0, mediaSize.height - targetH))

      setCropZoom(zoom)
      setCropInsets({
        left,
        top,
        right: mediaSize.width - targetW - left,
        bottom: mediaSize.height - targetH - top,
      })
    },
    [mediaSize, cropArea]
  )

  const toggleTrimPreview = async () => {
    const v = previewVideoRef.current
    if (!v) return

    if (previewPlaying) {
      try {
        v.pause()
      } catch {}
      setPreviewPlaying(false)
      return
    }

    try {
      // If current time is out of the trim range, jump to the trim start.
      if (v.currentTime < trimStart || v.currentTime > effectiveTrimEnd) v.currentTime = trimStart
      await v.play()
      setPreviewPlaying(true)
    } catch {
      setPreviewPlaying(false)
    }
  }

  const scrubTrimPreview = (nextTime: number) => {
    const v = previewVideoRef.current
    if (!v) return

    const t = clamp(nextTime, trimStart, effectiveTrimEnd)
    try {
      v.pause()
      v.currentTime = t
    } catch {}
    setPreviewPlaying(false)
    setPreviewTime(t)
  }

  const onSelectFile = (nextFile: File | null) => {
    if (!nextFile) return

    setError('')
    setFile(nextFile)
    selectedFileRef.current = nextFile

    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current)
    const objectUrl = URL.createObjectURL(nextFile)
    previewObjectUrlRef.current = objectUrl
    setPreviewUrl(objectUrl)

    const isVideo = nextFile.type.startsWith('video/')
    setMediaType(isVideo ? 'video' : 'image')
    setOriginalVideoInfo(null)

    setMediaSize(null)
    setCropArea(null)
    setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 })
    setCropRatio('free')
    setCropZoom(CROP_ZOOM_MIN)
    zoomBaseCropRef.current = null

    // Reset preview state (native controls are off).
    try {
      previewVideoRef.current?.pause()
    } catch {}
    setPreviewPlaying(false)
    setPreviewTime(0)

    setVideoDuration(0)
    setTrimStart(0)
    setTrimEnd(0)
    setTrimStartInput(null)
    setTrimEndInput(null)
    setPrivacyMaskFaces(false)
    setPrivacyMaskPlates(false)
    setPrivacyMaskStyle('blur')
    setPreviewPrivacyFaces([])
    setPreviewPrivacyPlates([])
    setRemoveMetaAiWatermark(false)
    setMetaAiWatermarkVisibleSec(META_AI_WATERMARK_VISIBLE_SEC_DEFAULT)
    setMetaAiWatermarkCorner('bottom-left')
  }

  const downloadFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const openIdb = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(IDB_DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME, { keyPath: 'id' })
        }
      }
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result)
    })

  const saveFileToIndexedDB = async (f: File) => {
    const db = await openIdb()
    const id = `out_${Date.now()}_${Math.random().toString(16).slice(2)}`

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite')
      const store = tx.objectStore(IDB_STORE_NAME)
      store.put({
        id,
        name: f.name,
        type: f.type,
        size: f.size,
        createdAt: new Date().toISOString(),
        blob: f,
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    db.close()
    return id
  }

  const computeOutputDims = (crop: Area) => {
    const aspect = crop.width / crop.height
    const autoCapH = effectiveAutoCapHeight

    let outW: number
    let outH: number

    // Custom W×H defines both crop aspect and target output size when Auto is selected.
    if (
      cropRatio === 'custom' &&
      customRatioWidth > 0 &&
      customRatioHeight > 0 &&
      outputResolution === 'auto'
    ) {
      outW = customRatioWidth
      outH = customRatioHeight
    } else {
      if (outputResolution === 'auto') {
        outH = Number.isFinite(autoCapH) ? Math.min(crop.height, autoCapH as number) : crop.height
      } else if (outputResolution === 'hq') {
        outH = crop.height
      } else {
        outH = Number(outputResolution)
      }
      outW = Math.round(outH * aspect)
    }

    // Canvas limits: avoid crashes on very large crops.
    const scale = Math.min(1, CANVAS_MAX_DIM / outW, CANVAS_MAX_DIM / outH)
    outW = outW * scale
    outH = outH * scale

    return { width: roundEvenDim(outW), height: roundEvenDim(outH) }
  }

  const previewOutputDims = useMemo(() => {
    if (!cropArea) return null
    return computeOutputDims(cropArea)
  }, [cropArea, cropRatio, customRatioWidth, customRatioHeight, outputResolution, effectiveAutoCapHeight])

  const processVideoClientSide = async (
    source: File,
    crop: Area,
    uiMediaSize: { width: number; height: number },
    startSec: number,
    endSec: number,
    settings: QualitySettings,
    output: { width: number; height: number },
    onProgress: (pct: number) => void,
    privacy?: { maskFaces: boolean; maskPlates: boolean; style: PrivacyMaskStyle },
    metaAiWatermark?: { visibleSec: number; corner: MetaAiWatermarkCorner }
  ): Promise<File> => {
    const inputUrl = URL.createObjectURL(source)
    const video = document.createElement('video')
    video.src = inputUrl
    video.preload = 'auto'
    video.playsInline = true
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = () => reject(new Error('Failed to load video metadata'))
      })

      const videoW = video.videoWidth || 0
      const videoH = video.videoHeight || 0
      crop = normalizeCropForVideoSpace(crop, uiMediaSize, videoW, videoH)

      const canvas = document.createElement('canvas')
      canvas.width = roundEvenDim(output.width)
      canvas.height = roundEvenDim(output.height)

      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Cannot create canvas context')

      const fps = settings.videoFps ?? 30
      const targetEnd = Math.max(0, Math.min(endSec, video.duration || endSec))
      if (targetEnd <= startSec) throw new Error('Trim end must be greater than trim start')

      const usePrivacy = !!(privacy?.maskFaces || privacy?.maskPlates)
      const useMetaAiWatermark = !!metaAiWatermark
      let cachedPrivacyRects: Array<{ x: number; y: number; width: number; height: number }> = []
      let metaAiOutputRect: { x: number; y: number; width: number; height: number } | null = null
      let privacyGen = 0
      let privacyFrameCount = 0
      const privacyDetectEvery = 3

      const schedulePrivacyRefresh = () => {
        if (!usePrivacy || !privacy) return
        const g = ++privacyGen
        void getCroppedOutputMaskRects(
          video,
          crop,
          canvas.width,
          canvas.height,
          { maskFaces: privacy.maskFaces, maskPlates: privacy.maskPlates }
        )
          .then((rects) => {
            if (g === privacyGen) cachedPrivacyRects = rects
          })
          .catch(() => {
            if (g === privacyGen) cachedPrivacyRects = []
          })
      }

      const drawFrame = () => {
        const vw = video.videoWidth || 0
        const vh = video.videoHeight || 0

        const sx = clamp(roundEvenCoord(crop.x), 0, Math.max(0, vw - 2))
        const sy = clamp(roundEvenCoord(crop.y), 0, Math.max(0, vh - 2))

        const maxSw = Math.max(2, vw - sx)
        const maxSh = Math.max(2, vh - sy)

        const sw = roundEvenDim(Math.min(crop.width, maxSw))
        const sh = roundEvenDim(Math.min(crop.height, maxSh))

        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

        if (usePrivacy && privacy) {
          privacyFrameCount++
          if (privacyFrameCount % privacyDetectEvery === 0) {
            schedulePrivacyRefresh()
          }
          applyPrivacyMasksAfterDraw(ctx, canvas, cachedPrivacyRects, privacy.style)
        }

        if (
          useMetaAiWatermark &&
          metaAiWatermark &&
          metaAiOutputRect &&
          video.currentTime < metaAiWatermark.visibleSec
        ) {
          applyPrivacyMasksAfterDraw(ctx, canvas, [metaAiOutputRect], 'blur')
        }
      }

      const preparePrivacyAndWatermark = async () => {
        await waitForVideoSeek(video, startSec)
        if (usePrivacy && privacy) {
          try {
            cachedPrivacyRects = await getCroppedOutputMaskRects(
              video,
              crop,
              canvas.width,
              canvas.height,
              { maskFaces: privacy.maskFaces, maskPlates: privacy.maskPlates }
            )
          } catch {
            cachedPrivacyRects = []
          }
        }
        if (useMetaAiWatermark && metaAiWatermark) {
          metaAiOutputRect = getMetaAiWatermarkOutputRect(
            crop,
            canvas.width,
            canvas.height,
            video.videoWidth || 0,
            video.videoHeight || 0,
            metaAiWatermark.corner
          )
        }
      }

      // Preferred path: WebCodecs stamps exact CFR + real AAC (MediaRecorder cannot on Windows).
      if (canUseWebCodecsVideoEncode()) {
        video.muted = true
        await preparePrivacyAndWatermark()
        // Do not silently fall back — MediaRecorder output fails App Store fps/audio checks.
        return await encodeCroppedVideoWebCodecs({
          video,
          canvas,
          drawFrame,
          startSec,
          endSec: targetEnd,
          fps,
          videoBitrateMbps: settings.videoBitrateMbps ?? 8,
          audioBitrateKbps: settings.audioBitrateKbps ?? 256,
          sourceFile: source,
          outputBaseName: source.name,
          onProgress,
          waitForVideoSeek,
        })
      }

      // Fallback only when WebCodecs API is missing (e.g. older Safari).
      console.warn('[crop-tool] WebCodecs unavailable; using MediaRecorder (fps/audio may be wrong)')
      const stream = canvas.captureStream(fps)

      // When we route audio through WebAudio -> MediaStream, we must keep the
      // AudioContext alive until MediaRecorder finishes; closing it early can
      // cut the destination tracks (resulting in silent recordings).
      let audioCtxToClose: AudioContext | null = null
      let silentOscillator: OscillatorNode | null = null
      const hasSourceAudio = videoElementHasAudio(video)

      // Prefer WebAudio routing for real audio; otherwise attach silent AAC for container completeness.
      const addAudioTracks = async () => {
        if (!hasSourceAudio) {
          const silent = attachSilentAudioTrack(stream)
          if (silent) {
            audioCtxToClose = silent.audioCtx
            silentOscillator = silent.oscillator
            if (audioCtxToClose.state === 'suspended') {
              await audioCtxToClose.resume().catch(() => {})
            }
          }
          return
        }

        let audioTracksAdded = false

        try {
          const AudioContextCtor =
            (window.AudioContext || (window as any).webkitAudioContext) as
              | (new () => AudioContext)
              | undefined
          if (AudioContextCtor) {
            const audioCtx = new AudioContextCtor()
            if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {})

            const sourceNode = audioCtx.createMediaElementSource(video)
            const dest = audioCtx.createMediaStreamDestination()
            sourceNode.connect(dest)
            // Do not connect to speakers — avoid audible playback during encode.

            video.muted = false
            video.volume = 1

            const destTracks = dest.stream.getAudioTracks()
            if (destTracks.length > 0) {
              destTracks.forEach((t) => stream.addTrack(t))
              audioTracksAdded = true
              audioCtxToClose = audioCtx
            } else {
              // No audio tracks produced; close immediately to avoid leaks.
              audioCtx.close().catch(() => {})
            }
          }
        } catch {
          // ignore
        }

        if (audioTracksAdded) return

        try {
          const audioStream =
            ((video as any).captureStream?.() || (video as any).mozCaptureStream?.()) as
              | MediaStream
              | undefined
          if (audioStream) {
            audioStream.getAudioTracks().forEach((t) => stream.addTrack(t))
          }
        } catch {
          // ignore
        }

        // Still no usable audio — fall back to silent track.
        if (stream.getAudioTracks().length === 0) {
          const silent = attachSilentAudioTrack(stream)
          if (silent) {
            audioCtxToClose = silent.audioCtx
            silentOscillator = silent.oscillator
          }
        }
      }

      await addAudioTracks()

      // Prefer MP4/H.264; WebM only when the browser cannot record MP4.
      const mime = pickExportMimeType()
      const usingAvc = mime.includes('mp4') || mime.includes('avc1')
      const hasAudioTrack = stream.getAudioTracks().length > 0

      const targetMbps = settings.videoBitrateMbps ?? 8
      const videoBitsPerSecond = usingAvc
        ? requestVideoBitsPerSecond(targetMbps)
        : Math.round(clamp(targetMbps, 1, 50) * 1_000_000)
      const audioBitsPerSecond = (settings.audioBitrateKbps ?? 256) * 1000

      // Do not set bitsPerSecond together with videoBitsPerSecond — Chrome may re-split
      // overall budget and ignore the video target.
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond,
        ...(hasAudioTrack ? { audioBitsPerSecond } : {}),
      })

      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      const total = Math.max(0.1, targetEnd - startSec)

      let rafId: number | null = null
      let stopTimerId: number | null = null
      const cleanupAudio = () => {
        try {
          silentOscillator?.stop()
        } catch {}
        silentOscillator = null
        audioCtxToClose?.close().catch(() => {})
        audioCtxToClose = null
      }
      const stop = () => {
        if (stopped) return
        stopped = true
        if (rafId != null) cancelAnimationFrame(rafId)
        rafId = null
        if (stopTimerId != null) window.clearTimeout(stopTimerId)
        stopTimerId = null
        try {
          video.pause()
        } catch {}
        try {
          recorder.stop()
        } catch {}
      }

      let stopped = false

      // Mute source when we are not capturing its audio (silent AAC is on the stream instead).
      // Muted also helps browsers allow play() during encode without a gesture race.
      if (!hasSourceAudio) {
        video.muted = true
        video.volume = 0
      }

      await new Promise<void>((resolve, reject) => {
        recorder.onstop = () => {
          cleanupAudio()
          resolve()
        }
        recorder.onerror = () => {
          cleanupAudio()
          reject(new Error('MediaRecorder failed'))
        }

        // Real-time 1× playback. captureStream(fps) stamps CFR; rAF only refreshes pixels.
        const runRealtimeEncode = async () => {
          const encodeStart = performance.now()

          const tick = () => {
            if (stopped) return
            drawFrame()
            const elapsed = (performance.now() - encodeStart) / 1000
            onProgress(clamp(Math.round((elapsed / total) * 100), 0, 100))
            if (video.currentTime >= targetEnd - 0.01 || video.ended) {
              stop()
              return
            }
            rafId = requestAnimationFrame(tick)
          }

          video.ontimeupdate = () => {
            if (stopped) return
            if (video.currentTime >= targetEnd - 0.01 || video.ended) {
              stop()
            }
          }

          // Hard stop slightly after trim length so captureStream cannot run forever.
          stopTimerId = window.setTimeout(() => {
            if (!stopped) stop()
          }, Math.ceil((total + 0.35) * 1000))

          recorder.start(500)
          onProgress(0)
          drawFrame()
          await video.play()
          rafId = requestAnimationFrame(tick)
        }

        void (async () => {
          try {
            await preparePrivacyAndWatermark()
            await runRealtimeEncode()
          } catch (e) {
            stop()
            reject(e instanceof Error ? e : new Error('Unable to encode video'))
          }
        })()
      })

      const outputType = recorder.mimeType || mime
      const outputExt = outputType.includes('mp4') ? '.mp4' : '.webm'

      const outputBlob = new Blob(chunks, { type: outputType })
      return new File(
        [outputBlob],
        source.name.replace(/\.[^.]+$/, outputExt),
        { type: outputType, lastModified: Date.now() }
      )
    } finally {
      try {
        video.pause()
      } catch {}
      URL.revokeObjectURL(inputUrl)
    }
  }

  const canProcess = useMemo(() => {
    return standaloneCropAllowed && !!file && !!cropArea && !processing
  }, [standaloneCropAllowed, file, cropArea, processing])

  const handleProcessAndSave = async () => {
    if (!file || !cropArea) return

    setError('')
    setProcessing(true)
    setProgress(0)
    setLastSavedName(null)

    try {
      const outputDims = computeOutputDims(cropArea)

      const privacyRequest =
        privacyMaskFaces || privacyMaskPlates
          ? {
              maskFaces: privacyMaskFaces,
              maskPlates: privacyMaskPlates,
              style: privacyMaskStyle,
            }
          : undefined

      if (privacyRequest) {
        await preloadPrivacyModels(privacyRequest)
      }

      if (mediaType === 'image') {
        const out = await compressImage(
          file,
          { maxWidth: outputDims.width, maxHeight: outputDims.height },
          cropArea,
          qualitySettings,
          privacyRequest
        )

        await saveFileToIndexedDB(out)
        setLastSavedName(out.name || 'cropped-image')
        downloadFile(out, out.name || 'cropped-image.jpg')
        setProgress(100)
      } else if (mediaType === 'video') {
        const encodingQuality: QualitySettings = {
          ...qualitySettings,
          videoFps: Math.round(clamp(userVideoFps, 15, 60)),
          videoBitrateMbps: clamp(userVideoBitrateMbps, 1, 50),
          audioBitrateKbps: Math.round(clamp(userAudioBitrateKbps, 64, 512)),
        }
        const out = await processVideoClientSide(
          file,
          cropArea,
          mediaSize ?? { width: cropArea.width, height: cropArea.height },
          trimStart,
          trimEnd || videoDuration,
          encodingQuality,
          { width: outputDims.width, height: outputDims.height },
          setProgress,
          privacyRequest,
          removeMetaAiWatermark
            ? {
                visibleSec: metaAiWatermarkVisibleSec,
                corner: metaAiWatermarkCorner,
              }
            : undefined
        )

        await saveFileToIndexedDB(out)
        setLastSavedName(out.name || 'processed-video')
        downloadFile(out, out.name || 'processed-video.mp4')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to process media')
    } finally {
      setProcessing(false)
    }
  }

  const exitCropTool = () => {
    // Full navigation matches navbar/admin behavior so media + file-input state cannot strand.
    window.location.assign('/')
  }

  const closeButton = (
    <button
      type="button"
      onClick={exitCropTool}
      className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg border border-tank-light/40 bg-tank-gray/80 text-gray-200 hover:bg-tank-light/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-tank-accent"
      aria-label="Close crop tool"
      title="Close"
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )

  return (
    <div className="min-h-screen w-full p-4 sm:p-6 pb-10">
      {!standaloneCropAllowed ? (
        <div className="card p-6 border border-red-500/30 bg-red-500/10 relative">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-white mb-2">Crop Tool is Disabled</h2>
              <p className="text-sm text-gray-200">
                The Crop Tool link is hidden in <span className="font-semibold">Navbar Control</span>. Ask an admin to
                enable the Crop Tool menu item, or log in as an admin to use the standalone tool from the admin panel.
              </p>
            </div>
            {closeButton}
          </div>
        </div>
      ) : (
        <div className="card space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <label className="block text-sm mb-2 text-gray-300">Select media</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={(e) => onSelectFile(e.target.files?.[0] || null)}
                className="text-sm"
              />
            </div>
            {closeButton}
          </div>

          {previewUrl && mediaType && (
            <div className="flex flex-col md:flex-row gap-6">
              {/* Left sidebar: original + crop tool setting + ratio + process */}
              <div className="space-y-4 order-2 md:order-1 md:flex-1">
                <div className="card p-4 bg-tank-dark/50 border border-tank-light/20 rounded-xl">
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium text-white mb-2">
                        {mediaType === 'video' ? 'Original Video' : 'Original Image'}
                      </h3>
                      <div
                        className={
                          mediaType === 'video'
                            ? 'grid grid-cols-2 gap-2 text-sm'
                            : 'grid grid-cols-1 gap-2 text-sm'
                        }
                      >
                        <div>
                          <span className="text-gray-400">Resolution</span>
                          <div className="text-white font-semibold">
                            {mediaSize ? `${mediaSize.width}x${mediaSize.height}` : '0x0'}
                          </div>
                        </div>
                        {mediaType === 'video' && (
                          <div>
                            <span className="text-gray-400">Duration</span>
                            <div className="text-white font-semibold">
                              {originalVideoInfo ? `${originalVideoInfo.durationSec.toFixed(2)} sec` : '0 sec'}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-medium text-white mb-3">Crop Tool Setting</h3>
                      {mediaType === 'video' && (
                        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                          Export uses WebCodecs (Chrome/Edge recommended) so frame rate and duration match the targets —
                          use 30 fps for App Store previews. Odd sizes (e.g. 886×1920) tune H.264 GOP length toward the
                          target bitrate; MediaRecorder is only used when WebCodecs is unavailable.
                        </p>
                      )}

                      <div className="space-y-3">
                        {mediaType === 'image' && (
                          <div className="flex items-center gap-3 w-full">
                            <label className="text-sm text-gray-300 whitespace-nowrap">Output Resolution</label>
                            <select
                              value={outputResolution}
                              onChange={(e) => setOutputResolution(e.target.value as CropOutputResolution)}
                              className="bg-tank-gray border border-tank-light px-3 py-2 text-white flex-1 rounded"
                            >
                              {resolutionOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {mediaType === 'video' && (
                          <>
                            <div>
                              <label className="text-sm text-gray-300">Target frame rate</label>
                              <div className="flex items-center gap-3">
                                <input
                                  type="number"
                                  min={15}
                                  max={60}
                                  step={1}
                                  value={userVideoFps}
                                  onChange={(e) => setUserVideoFps(clamp(Number(e.target.value) || 30, 15, 60))}
                                  className="flex-1 bg-tank-gray border border-tank-light px-3 py-2 text-white rounded"
                                />
                                <span className="text-sm text-gray-300 whitespace-nowrap min-w-[88px] text-right">
                                  {Math.round(userVideoFps)} fps
                                </span>
                              </div>
                            </div>

                            <div>
                              <label className="text-sm text-gray-300">Target video bitrate</label>
                              <div className="flex items-center gap-3">
                                <input
                                  type="number"
                                  min={1}
                                  max={50}
                                  step={0.5}
                                  value={userVideoBitrateMbps}
                                  onChange={(e) => setUserVideoBitrateMbps(clamp(Number(e.target.value) || 8, 1, 50))}
                                  className="flex-1 bg-tank-gray border border-tank-light px-3 py-2 text-white rounded"
                                />
                                <span className="text-sm text-gray-300 whitespace-nowrap min-w-[88px] text-right">
                                  {userVideoBitrateMbps.toFixed(1)} Mbps
                                </span>
                              </div>
                            </div>

                            <div>
                              <label className="text-sm text-gray-300">Target audio bitrate</label>
                              <div className="flex items-center gap-3">
                                <input
                                  type="number"
                                  min={64}
                                  max={512}
                                  step={32}
                                  value={userAudioBitrateKbps}
                                  onChange={(e) =>
                                    setUserAudioBitrateKbps(clamp(Number(e.target.value) || 256, 64, 512))
                                  }
                                  className="flex-1 bg-tank-gray border border-tank-light px-3 py-2 text-white rounded"
                                />
                                <span className="text-sm text-gray-300 whitespace-nowrap min-w-[88px] text-right">
                                  {Math.round(userAudioBitrateKbps)} kbps
                                </span>
                              </div>
                            </div>
                          </>
                        )}

                        {(mediaType === 'video' || mediaType === 'image') && (
                          <div className="border-t border-tank-light/25 pt-4 mt-2 space-y-3">
                            <h4 className="text-sm font-semibold text-white">Privacy masking</h4>
                            <p className="text-xs text-gray-400 leading-relaxed">
                              Runs in your browser before save. Faces use MediaPipe Face Detector (full range).
                              License plates use a{' '}
                              <span className="text-gray-300">bottom band on detected vehicles</span> (cars, trucks,
                              buses, motorcycles)—not a dedicated plate reader; verify in preview.
                            </p>
                            <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={privacyMaskFaces}
                                onChange={(e) => setPrivacyMaskFaces(e.target.checked)}
                                className="rounded border-tank-light"
                              />
                              Mask faces
                            </label>
                            <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={privacyMaskPlates}
                                onChange={(e) => setPrivacyMaskPlates(e.target.checked)}
                                className="rounded border-tank-light"
                              />
                              Mask license plates (vehicle heuristic)
                            </label>
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">Mask style</label>
                              <select
                                value={privacyMaskStyle}
                                onChange={(e) => setPrivacyMaskStyle(e.target.value as PrivacyMaskStyle)}
                                disabled={!privacyMaskFaces && !privacyMaskPlates}
                                className="w-full bg-tank-gray border border-tank-light px-3 py-2 text-white rounded disabled:opacity-50"
                              >
                                <option value="blur">Blur</option>
                                <option value="pixelate">Pixelate</option>
                                <option value="solid">Solid black</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {mediaType === 'video' && (
                          <div className="border-t border-tank-light/25 pt-4 mt-2 space-y-3">
                            <h4 className="text-sm font-semibold text-white">Meta AI watermark</h4>
                            <p className="text-xs text-gray-400 leading-relaxed">
                              Meta AI videos show an &ldquo;Imagined with AI&rdquo; corner badge for the first few
                              seconds, then it disappears. When enabled, blurs that region only while the badge is
                              still visible in the source — later frames stay untouched.
                            </p>
                            <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={removeMetaAiWatermark}
                                onChange={(e) => setRemoveMetaAiWatermark(e.target.checked)}
                                className="rounded border-tank-light"
                              />
                              Remove Meta AI watermark
                            </label>
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">Badge visible for (seconds)</label>
                              <input
                                type="number"
                                min={0.5}
                                max={15}
                                step={0.5}
                                value={metaAiWatermarkVisibleSec}
                                onChange={(e) =>
                                  setMetaAiWatermarkVisibleSec(
                                    clamp(parseFloat(e.target.value) || META_AI_WATERMARK_VISIBLE_SEC_DEFAULT, 0.5, 15)
                                  )
                                }
                                disabled={!removeMetaAiWatermark}
                                className="w-full bg-tank-gray border border-tank-light px-3 py-2 text-white rounded disabled:opacity-50"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">Badge corner</label>
                              <select
                                value={metaAiWatermarkCorner}
                                onChange={(e) =>
                                  setMetaAiWatermarkCorner(e.target.value as MetaAiWatermarkCorner)
                                }
                                disabled={!removeMetaAiWatermark}
                                className="w-full bg-tank-gray border border-tank-light px-3 py-2 text-white rounded disabled:opacity-50"
                              >
                                <option value="bottom-left">Bottom left</option>
                                <option value="bottom-right">Bottom right</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm text-gray-300">Ratio</label>
                  <select
                    value={cropRatio}
                    onChange={(e) => {
                      const r = e.target.value
                      setCropRatio(r)
                      applyRatio(r)
                    }}
                    className="bg-tank-gray border border-tank-light px-3 py-2 text-white"
                  >
                    <option value="free">Free</option>
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                    <option value="4:3">4:3</option>
                    <option value="1:1">1:1</option>
                    <option value="custom">Custom</option>
                  </select>
                  {cropRatio === 'custom' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={customRatioWidth}
                        onChange={(e) => {
                          const nextW = Math.max(1, parseInt(e.target.value, 10) || 1)
                          setCustomRatioWidth(nextW)
                          applyRatio('custom', nextW, customRatioHeight)
                        }}
                        aria-label="Custom ratio horizontal pixels"
                        placeholder="Horizontal"
                        className="w-24 bg-tank-gray border border-tank-light px-3 py-2 text-white"
                      />
                      <span className="text-gray-400 text-sm">×</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={customRatioHeight}
                        onChange={(e) => {
                          const nextH = Math.max(1, parseInt(e.target.value, 10) || 1)
                          setCustomRatioHeight(nextH)
                          applyRatio('custom', customRatioWidth, nextH)
                        }}
                        aria-label="Custom ratio vertical pixels"
                        placeholder="Vertical"
                        className="w-24 bg-tank-gray border border-tank-light px-3 py-2 text-white"
                      />
                      <span className="text-xs text-gray-500">target output px</span>
                    </div>
                  )}
                </div>

                {previewOutputDims && (
                  <p className="text-xs text-gray-400">
                    Output size:{' '}
                    <span className="text-white font-medium tabular-nums">
                      {previewOutputDims.width}×{previewOutputDims.height}
                    </span>
                    {outputResolution !== 'auto' ? ` (${outputResolution === 'hq' ? 'HQ crop' : `${outputResolution}p`})` : ''}
                  </p>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={!canProcess}
                    onClick={handleProcessAndSave}
                    className="px-5 py-2 bg-emerald-500 text-black font-semibold disabled:opacity-50"
                  >
                    {processing ? `Processing... ${progress}%` : 'Process & Save Locally'}
                  </button>
                </div>

                {lastSavedName && (
                  <p className="text-sm text-green-300">
                    Saved locally: <span className="font-semibold">{lastSavedName}</span>
                  </p>
                )}
              </div>

              {/* Right panel: preview + trim + crop insets */}
              <div className="space-y-4 order-1 md:order-2 md:flex-1">
                <div
                  ref={containerRef}
                  className="relative w-full h-[clamp(260px,45vh,560px)] bg-black overflow-hidden rounded-lg"
                >
                  {mediaType === 'image' ? (
                    <img
                      ref={(el) => {
                        visualRef.current = el
                      }}
                      src={previewUrl}
                      alt="preview"
                      className="w-full h-full object-contain"
                      onLoad={(e) => {
                        const w = e.currentTarget.naturalWidth
                        const h = e.currentTarget.naturalHeight
                        setMediaSize({ width: w, height: h })
                        // Default crop selection: cover the entire original media.
                        setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 })
                        setCropArea({ x: 0, y: 0, width: w, height: h })
                        requestAnimationFrame(updateRenderBox)
                      }}
                    />
                  ) : (
                    <video
                      ref={(el) => {
                        previewVideoRef.current = el
                        visualRef.current = el
                      }}
                      src={previewUrl}
                      className="w-full h-full object-contain"
                      onLoadedMetadata={(e) => {
                        const v = e.currentTarget
                        const w = v.videoWidth
                        const h = v.videoHeight
                        setMediaSize({ width: w, height: h })
                        // Default crop selection: cover the entire original media.
                        setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 })
                        setCropArea({ x: 0, y: 0, width: w, height: h })
                        setVideoDuration(v.duration || 0)
                        const f = selectedFileRef.current
                        if (f) {
                          const durationSec = v.duration || 0
                          const approxOverallBitrateKbps =
                            durationSec > 0 ? (f.size * 8) / durationSec / 1000 : null
                          setOriginalVideoInfo({
                            width: v.videoWidth,
                            height: v.videoHeight,
                            durationSec,
                            fileSizeBytes: f.size,
                            mime: f.type,
                            approxOverallBitrateKbps,
                          })
                        }
                        setTrimStart(0)
                        setTrimEnd(v.duration || 0)
                        setTrimStartInput(null)
                        setTrimEndInput(null)
                        setPreviewTime(0)
                        setPreviewPlaying(false)
                        // Native controls are removed, but the browser may still
                        // initialize `currentTime` to a non-zero value. For trim
                        // preview, ensure the playhead starts at `trimStart`.
                        try {
                          v.pause()
                          v.currentTime = 0
                        } catch {}
                        if (previewPlaybackTimerRef.current != null) {
                          clearInterval(previewPlaybackTimerRef.current)
                          previewPlaybackTimerRef.current = null
                        }
                        requestAnimationFrame(updateRenderBox)
                      }}
                    />
                  )}

                  {mediaType === 'video' &&
                    cropArea &&
                    mediaSize &&
                    renderBox &&
                    (privacyMaskFaces || privacyMaskPlates) &&
                    (previewPrivacyFaces.length > 0 || previewPrivacyPlates.length > 0) && (
                      <div
                        className="absolute left-0 right-0 top-0 z-[8] pointer-events-none overflow-hidden"
                        style={{ bottom: 0 }}
                        aria-hidden="true"
                      >
                        {previewPrivacyFaces.map((r, i) => {
                          const scaleX = renderBox.width / mediaSize.width
                          const scaleY = renderBox.height / mediaSize.height
                          const left = renderBox.offsetX + r.x * scaleX
                          const top = renderBox.offsetY + r.y * scaleY
                          const width = r.width * scaleX
                          const height = r.height * scaleY
                          return (
                            <div
                              key={`pf-${i}`}
                              className="absolute border-2 border-dashed border-amber-400/90 rounded-sm"
                              style={{ left, top, width, height }}
                            />
                          )
                        })}
                        {previewPrivacyPlates.map((r, i) => {
                          const scaleX = renderBox.width / mediaSize.width
                          const scaleY = renderBox.height / mediaSize.height
                          const left = renderBox.offsetX + r.x * scaleX
                          const top = renderBox.offsetY + r.y * scaleY
                          const width = r.width * scaleX
                          const height = r.height * scaleY
                          return (
                            <div
                              key={`pp-${i}`}
                              className="absolute border-2 border-dashed border-orange-400/90 rounded-sm"
                              style={{ left, top, width, height }}
                            />
                          )
                        })}
                      </div>
                    )}

                  {mediaType === 'video' &&
                    cropArea &&
                    mediaSize &&
                    renderBox &&
                    showMetaAiWatermarkPreview &&
                    previewMetaAiWatermarkRect && (
                      <div
                        className="absolute left-0 right-0 top-0 z-[8] pointer-events-none overflow-hidden"
                        style={{ bottom: 0 }}
                        aria-hidden="true"
                      >
                        {(() => {
                          const r = previewMetaAiWatermarkRect
                          const scaleX = renderBox.width / mediaSize.width
                          const scaleY = renderBox.height / mediaSize.height
                          const left = renderBox.offsetX + r.x * scaleX
                          const top = renderBox.offsetY + r.y * scaleY
                          const width = r.width * scaleX
                          const height = r.height * scaleY
                          return (
                            <div
                              className="absolute border-2 border-dashed border-sky-400/90 rounded-sm"
                              style={{ left, top, width, height }}
                            />
                          )
                        })()}
                      </div>
                    )}

                  {cropArea && mediaSize && renderBox && (
                    <div
                      className="absolute left-0 right-0 top-0 z-10 pointer-events-none overflow-hidden"
                      style={{ bottom: 0 }}
                    >
                      {(() => {
                        const scaleX = renderBox.width / mediaSize.width
                        const scaleY = renderBox.height / mediaSize.height
                        const left = renderBox.offsetX + cropArea.x * scaleX
                        const top = renderBox.offsetY + cropArea.y * scaleY
                        const width = cropArea.width * scaleX
                        const height = cropArea.height * scaleY

                        return (
                          <div
                            role="presentation"
                            onMouseDown={(e) => {
                              dragRef.current.active = true
                              dragRef.current.startX = e.clientX
                              dragRef.current.startY = e.clientY
                              dragRef.current.startTop = cropInsets.top
                              dragRef.current.startLeft = cropInsets.left
                            }}
                            onTouchStart={(e) => {
                              dragRef.current.active = true
                              dragRef.current.startX = e.touches[0].clientX
                              dragRef.current.startY = e.touches[0].clientY
                              dragRef.current.startTop = cropInsets.top
                              dragRef.current.startLeft = cropInsets.left
                            }}
                            style={{
                              position: 'absolute',
                              left,
                              top,
                              width,
                              height,
                              border: '2px solid rgba(0,255,136,0.95)',
                              boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                              pointerEvents: 'auto',
                              cursor: 'move',
                            }}
                          />
                        )
                      })()}
                    </div>
                  )}
                </div>

                {mediaType === 'video' && videoDuration > 0 && (
                  <div className="card p-4 bg-tank-dark/50 border border-tank-light/20 rounded-xl">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={toggleTrimPreview}
                        className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold px-3 py-2 rounded-lg"
                        aria-label={previewPlaying ? 'Pause trim preview' : 'Play trim preview'}
                      >
                        {previewPlaying ? 'Pause' : 'Play'}
                      </button>

                      <div className="text-sm font-semibold text-white bg-tank-gray px-3 py-1 rounded-lg whitespace-nowrap">
                        {formatTimeSec(previewTime)} / {formatTimeSec(effectiveTrimEnd)}
                      </div>

                      <input
                        type="range"
                        min={trimStart}
                        max={effectiveTrimEnd}
                        step={0.01}
                        value={clamp(previewTime, trimStart, effectiveTrimEnd)}
                        onChange={(e) => scrubTrimPreview(Number(e.target.value))}
                        className="flex-1 w-full accent-tank-light"
                      />
                    </div>
                  </div>
                )}

                {/* Request #2: move Output Resolution between Play and Trim start/end */}
                {mediaType === 'video' && videoDuration > 0 && (
                  <div className="card p-3 bg-tank-dark/50 border border-tank-light/20 rounded-xl">
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-300 whitespace-nowrap">Output Resolution</label>
                      <select
                        value={outputResolution}
                        onChange={(e) => setOutputResolution(e.target.value as CropOutputResolution)}
                        className="bg-tank-gray border border-tank-light px-3 py-2 text-white flex-1 rounded"
                      >
                        {resolutionOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {mediaType === 'video' && videoDuration > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TrimTimeField
                      label="Trim Start"
                      seconds={trimStart}
                      draft={trimStartInput}
                      setDraft={setTrimStartInput}
                      onCommit={(sec) => {
                        const v = Math.max(0, Math.min(sec, Math.max(0, trimEnd - 0.1)))
                        setTrimStart(v)
                        if (trimEnd < v) setTrimEnd(v)
                      }}
                      onStep={stepTrimStart}
                    />
                    <TrimTimeField
                      label="Trim End"
                      seconds={trimEnd}
                      draft={trimEndInput}
                      setDraft={setTrimEndInput}
                      onCommit={(sec) => {
                        setTrimEnd(Math.max(trimStart + 0.1, Math.min(sec, videoDuration)))
                      }}
                      onStep={stepTrimEnd}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {mediaSize && (
                    <>
                      <div className="sm:col-span-2">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-sm text-gray-300" htmlFor="crop-zoom">
                            Zoom
                          </label>
                          <span className="text-sm text-gray-400 tabular-nums">{cropZoom.toFixed(1)}×</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <button
                            type="button"
                            aria-label="Zoom out"
                            disabled={cropZoom <= CROP_ZOOM_MIN}
                            onClick={() => applyCropZoom(cropZoom - CROP_ZOOM_STEP)}
                            className="shrink-0 rounded border border-tank-light bg-tank-gray px-2 py-1 text-white disabled:opacity-40"
                          >
                            −
                          </button>
                          <input
                            id="crop-zoom"
                            type="range"
                            min={CROP_ZOOM_MIN}
                            max={CROP_ZOOM_MAX}
                            step={CROP_ZOOM_STEP}
                            value={cropZoom}
                            onChange={(e) => applyCropZoom(Number(e.target.value))}
                            className="min-w-0 flex-1 accent-emerald-500"
                          />
                          <button
                            type="button"
                            aria-label="Zoom in"
                            disabled={cropZoom >= CROP_ZOOM_MAX}
                            onClick={() => applyCropZoom(cropZoom + CROP_ZOOM_STEP)}
                            className="shrink-0 rounded border border-tank-light bg-tank-gray px-2 py-1 text-white disabled:opacity-40"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            disabled={cropZoom <= CROP_ZOOM_MIN}
                            onClick={() => applyCropZoom(CROP_ZOOM_MIN)}
                            className="shrink-0 rounded border border-tank-light bg-tank-gray px-2 py-1 text-xs text-gray-300 disabled:opacity-40"
                          >
                            Reset
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          1× is your current frame. Higher zoom tightens the crop; drag the green box to pan.
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-300">Top</label>
                        <input
                          type="number"
                          value={cropInsets.top}
                          onChange={(e) => {
                            setCropZoom(CROP_ZOOM_MIN)
                            setCropInsets((p) => ({ ...p, top: Number(e.target.value) || 0 }))
                          }}
                          className="mt-1 w-full bg-tank-gray border border-tank-light px-3 py-2 text-white rounded"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-300">Bottom</label>
                        <input
                          type="number"
                          value={cropInsets.bottom}
                          onChange={(e) => {
                            setCropZoom(CROP_ZOOM_MIN)
                            setCropInsets((p) => ({ ...p, bottom: Number(e.target.value) || 0 }))
                          }}
                          className="mt-1 w-full bg-tank-gray border border-tank-light px-3 py-2 text-white rounded"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-300">Left</label>
                        <input
                          type="number"
                          value={cropInsets.left}
                          onChange={(e) => {
                            setCropZoom(CROP_ZOOM_MIN)
                            setCropInsets((p) => ({ ...p, left: Number(e.target.value) || 0 }))
                          }}
                          className="mt-1 w-full bg-tank-gray border border-tank-light px-3 py-2 text-white rounded"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-300">Right</label>
                        <input
                          type="number"
                          value={cropInsets.right}
                          onChange={(e) => {
                            setCropZoom(CROP_ZOOM_MIN)
                            setCropInsets((p) => ({ ...p, right: Number(e.target.value) || 0 }))
                          }}
                          className="mt-1 w-full bg-tank-gray border border-tank-light px-3 py-2 text-white rounded"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      )}
    </div>
  )
}

