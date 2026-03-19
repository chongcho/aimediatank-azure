'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { compressImage, type QualitySettings } from '@/lib/mediaCompression'

type Area = { x: number; y: number; width: number; height: number }

type RenderBox = {
  width: number
  height: number
  offsetX: number
  offsetY: number
}

const minCropSize = 80
const VIDEO_CONTROLS_RESERVE_PX = 50

export default function CropToolPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null)
  const [mediaSize, setMediaSize] = useState<{ width: number; height: number } | null>(null)
  const [renderBox, setRenderBox] = useState<RenderBox | null>(null)
  const [cropInsets, setCropInsets] = useState({ top: 0, right: 0, bottom: 0, left: 0 })
  const [cropArea, setCropArea] = useState<Area | null>(null)
  const [cropRatio, setCropRatio] = useState<string>('free')
  const [videoDuration, setVideoDuration] = useState(0)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [qualitySettings, setQualitySettings] = useState<QualitySettings>({})

  const containerRef = useRef<HTMLDivElement | null>(null)
  const visualRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null)
  const previewObjectUrlRef = useRef<string | null>(null)
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; startTop: number; startLeft: number }>({
    active: false,
    startX: 0,
    startY: 0,
    startTop: 0,
    startLeft: 0,
  })

  useEffect(() => {
    fetch('/api/ui/crop-settings')
      .then((res) => res.json())
      .then((data) => {
        if (!data?.settings) return
        setQualitySettings({
          imageQuality: data.settings.imageQuality,
          videoBitrateMbps: data.settings.videoBitrateMbps,
          videoFps: data.settings.videoFps,
          audioBitrateKbps: data.settings.audioBitrateKbps,
        })
      })
      .catch(() => {})
  }, [])

  // Revoke preview blob URLs to avoid memory leaks.
  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current)
      previewObjectUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mediaSize) return
    const left = Math.min(Math.max(0, cropInsets.left), Math.max(0, mediaSize.width - minCropSize - cropInsets.right))
    const right = Math.min(Math.max(0, cropInsets.right), Math.max(0, mediaSize.width - minCropSize - left))
    const top = Math.min(Math.max(0, cropInsets.top), Math.max(0, mediaSize.height - minCropSize - cropInsets.bottom))
    const bottom = Math.min(Math.max(0, cropInsets.bottom), Math.max(0, mediaSize.height - minCropSize - top))
    setCropArea({
      x: left,
      y: top,
      width: Math.max(minCropSize, mediaSize.width - left - right),
      height: Math.max(minCropSize, mediaSize.height - top - bottom),
    })
  }, [cropInsets, mediaSize])

  const updateRenderBox = () => {
    const container = containerRef.current
    const el = visualRef.current
    const naturalW = mediaSize?.width
    const naturalH = mediaSize?.height
    if (!container || !el || !naturalW || !naturalH) return
    const rect = container.getBoundingClientRect()
    // Reserve space at the bottom for native video controls so the green crop box
    // doesn't overlap them (matches the UI expectation in the screenshot).
    const reservePx = mediaType === 'video' ? VIDEO_CONTROLS_RESERVE_PX : 0
    const effectiveHeightPx = Math.max(1, rect.height - reservePx)
    const scale = Math.min(rect.width / naturalW, effectiveHeightPx / naturalH)
    const width = naturalW * scale
    const height = naturalH * scale
    setRenderBox({
      width,
      height,
      offsetX: (rect.width - width) / 2,
      offsetY: (effectiveHeightPx - height) / 2,
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
      setCropInsets({ top: Math.round(nextTop), right: Math.round(right), bottom: Math.round(bottom), left: Math.round(nextLeft) })
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

  const applyRatio = (ratio: string) => {
    if (!mediaSize || ratio === 'free') return
    const [n, d] = ratio.split(':').map(Number)
    if (!n || !d) return
    const R = n / d
    let width = mediaSize.width
    let height = Math.round(width / R)
    if (height > mediaSize.height) {
      height = mediaSize.height
      width = Math.round(height * R)
    }
    const left = Math.round((mediaSize.width - width) / 2)
    const top = Math.round((mediaSize.height - height) / 2)
    setCropInsets({
      left,
      right: mediaSize.width - width - left,
      top,
      bottom: mediaSize.height - height - top,
    })
  }

  const onSelectFile = (nextFile: File | null) => {
    if (!nextFile) return
    setError('')
    setFile(nextFile)
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current)
    const objectUrl = URL.createObjectURL(nextFile)
    previewObjectUrlRef.current = objectUrl
    setPreviewUrl(objectUrl)
    const isVideo = nextFile.type.startsWith('video/')
    setMediaType(isVideo ? 'video' : 'image')
    setMediaSize(null)
    setCropArea(null)
    setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 })
    setCropRatio('free')
    setVideoDuration(0)
    setTrimStart(0)
    setTrimEnd(0)
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

  const processVideoClientSide = async (
    source: File,
    crop: Area,
    startSec: number,
    endSec: number,
    settings: QualitySettings,
    onProgress: (pct: number) => void,
  ): Promise<File> => {
    const inputUrl = URL.createObjectURL(source)
    const video = document.createElement('video')
    video.src = inputUrl
    video.preload = 'auto'
    video.playsInline = true
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Failed to load video metadata'))
    })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(crop.width / 2) * 2
    canvas.height = Math.round(crop.height / 2) * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Cannot create canvas context')

    const fps = settings.videoFps ?? 30
    const stream = canvas.captureStream(fps)

    try {
      const audioStream = (video as any).captureStream?.()
      if (audioStream) {
        audioStream.getAudioTracks().forEach((t: MediaStreamTrack) => stream.addTrack(t))
      }
    } catch {
      // continue without audio tracks
    }

    const preferred = [
      'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
      'video/mp4',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ]
    const mime = preferred.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm'
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: (settings.videoBitrateMbps ?? 8) * 1_000_000,
      audioBitsPerSecond: (settings.audioBitrateKbps ?? 256) * 1000,
    })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    const targetEnd = Math.min(endSec, video.duration || endSec)
    const total = Math.max(0.1, targetEnd - startSec)

    await new Promise<void>((resolve, reject) => {
      let stopped = false
      const stop = () => {
        if (stopped) return
        stopped = true
        try {
          recorder.stop()
        } catch {
          // ignore
        }
      }

      recorder.onstop = () => resolve()
      recorder.onerror = () => reject(new Error('MediaRecorder failed'))

      const draw = () => {
        if (stopped) return
        if (video.currentTime >= targetEnd || video.ended) {
          stop()
          return
        }
        ctx.drawImage(
          video,
          Math.round(crop.x),
          Math.round(crop.y),
          Math.round(crop.width),
          Math.round(crop.height),
          0,
          0,
          canvas.width,
          canvas.height
        )
        const pct = Math.round(((video.currentTime - startSec) / total) * 100)
        onProgress(Math.max(0, Math.min(100, pct)))
        requestAnimationFrame(draw)
      }

      video.currentTime = Math.max(0, startSec)
      video.onseeked = async () => {
        recorder.start(500)
        try {
          await video.play()
        } catch {
          stop()
          reject(new Error('Unable to play video for client processing'))
          return
        }
        draw()
      }
    })

    video.pause()
    URL.revokeObjectURL(inputUrl)

    const outputType = recorder.mimeType || mime
    const outputExt = outputType.includes('mp4') ? '.mp4' : '.webm'
    const outputBlob = new Blob(chunks, { type: outputType })
    return new File([outputBlob], source.name.replace(/\.[^.]+$/, outputExt), { type: outputType, lastModified: Date.now() })
  }

  const canProcess = useMemo(() => !!file && !!cropArea && !processing, [file, cropArea, processing])

  const handleProcessAndSave = async () => {
    if (!file || !cropArea) return
    setError('')
    setProcessing(true)
    setProgress(0)
    try {
      if (mediaType === 'image') {
        const out = await compressImage(file, {}, cropArea, qualitySettings)
        downloadFile(out, out.name || 'cropped-image.jpg')
        setProgress(100)
      } else if (mediaType === 'video') {
        const out = await processVideoClientSide(file, cropArea, trimStart, trimEnd || videoDuration, qualitySettings, setProgress)
        downloadFile(out, out.name || 'processed-video.mp4')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to process media')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 pb-24">
      <div className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-white">Crop Tool</h1>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="w-10 h-10 rounded-md bg-tank-gray hover:bg-tank-light text-white flex items-center justify-center"
            aria-label="Close Crop Tool"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-gray-400">Independent client-side crop/trim/re-encode tool. Processing happens on your device.</p>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="block text-sm mb-2 text-gray-300">Select media</label>
          <input
            type="file"
            accept="image/*,video/*"
            onChange={(e) => onSelectFile(e.target.files?.[0] || null)}
            className="text-sm"
          />
        </div>

        {previewUrl && (
          <>
            <div ref={containerRef} className="relative w-full h-[220px] sm:h-[320px] md:h-[420px] bg-black overflow-hidden rounded-lg">
              {mediaType === 'image' ? (
                <img
                  ref={(el) => {
                    visualRef.current = el
                  }}
                  src={previewUrl}
                  alt="preview"
                  className="w-full h-full object-contain"
                  onLoad={(e) => {
                    setMediaSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
                    requestAnimationFrame(updateRenderBox)
                  }}
                />
              ) : (
                <video
                  ref={(el) => {
                    visualRef.current = el
                  }}
                  src={previewUrl}
                  controls
                  className="w-full h-full object-contain"
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget
                    setMediaSize({ width: v.videoWidth, height: v.videoHeight })
                    setVideoDuration(v.duration || 0)
                    setTrimStart(0)
                    setTrimEnd(v.duration || 0)
                    requestAnimationFrame(updateRenderBox)
                  }}
                />
              )}

              {cropArea && mediaSize && renderBox && (
                <div className="absolute inset-0 z-10 pointer-events-none">
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

            <div className="flex items-center gap-3">
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
              </select>
            </div>

            {mediaType === 'video' && videoDuration > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-300">Trim Start (sec)</label>
                  <input
                    type="number"
                    min={0}
                    max={Math.max(0, trimEnd - 0.1)}
                    step={0.1}
                    value={trimStart}
                    onChange={(e) => setTrimStart(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-300">Trim End (sec)</label>
                  <input
                    type="number"
                    min={Math.max(0.1, trimStart + 0.1)}
                    max={videoDuration}
                    step={0.1}
                    value={trimEnd}
                    onChange={(e) => setTrimEnd(Math.max(trimStart + 0.1, Number(e.target.value) || videoDuration))}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {mediaSize && (
                <>
                  <div>
                    <label className="text-sm text-gray-300">Top</label>
                    <input type="number" value={cropInsets.top} onChange={(e) => setCropInsets((p) => ({ ...p, top: Number(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <label className="text-sm text-gray-300">Bottom</label>
                    <input type="number" value={cropInsets.bottom} onChange={(e) => setCropInsets((p) => ({ ...p, bottom: Number(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <label className="text-sm text-gray-300">Left</label>
                    <input type="number" value={cropInsets.left} onChange={(e) => setCropInsets((p) => ({ ...p, left: Number(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <label className="text-sm text-gray-300">Right</label>
                    <input type="number" value={cropInsets.right} onChange={(e) => setCropInsets((p) => ({ ...p, right: Number(e.target.value) || 0 }))} />
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!canProcess}
                onClick={handleProcessAndSave}
                className="px-5 py-2 bg-emerald-500 text-black font-semibold disabled:opacity-50"
              >
                {processing ? `Processing... ${progress}%` : 'Process & Save'}
              </button>
            </div>
          </>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    </div>
  )
}

