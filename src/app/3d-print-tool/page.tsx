'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { goToAdminPanel } from '@/lib/adminPanelNav'
import {
  buildStlFromImage,
  drawHeightmapPreview,
  imageToHeightmap,
  type ImageToStlMode,
  type StlBuildResult,
} from '@/lib/imageToStl'

export default function ThreeDPrintToolPage() {
  const { data: session, status } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'

  const [fileName, setFileName] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [widthMm, setWidthMm] = useState(80)
  const [reliefMm, setReliefMm] = useState(3)
  const [baseMm, setBaseMm] = useState(1.2)
  const [maxSamples, setMaxSamples] = useState(180)
  const [mode, setMode] = useState<ImageToStlMode>('relief')
  const [invert, setInvert] = useState(false)

  const [result, setResult] = useState<StlBuildResult | null>(null)

  const imageRef = useRef<HTMLImageElement | null>(null)
  const heightCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  const clearMedia = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setPreviewUrl(null)
    setFileName(null)
    setImageSize(null)
    setResult(null)
    setError('')
    imageRef.current = null
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const onSelectFile = useCallback(
    (file: File | null) => {
      setError('')
      setResult(null)
      if (!file) {
        clearMedia()
        return
      }
      if (!file.type.startsWith('image/')) {
        setError('Please choose an image file (PNG, JPEG, WebP, etc.).')
        return
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const url = URL.createObjectURL(file)
      objectUrlRef.current = url
      setPreviewUrl(url)
      setFileName(file.name)

      const img = new Image()
      img.onload = () => {
        imageRef.current = img
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.onerror = () => {
        setError('Could not load that image.')
        clearMedia()
      }
      img.src = url
    },
    [clearMedia]
  )

  const refreshHeightPreview = useCallback(() => {
    const img = imageRef.current
    const canvas = heightCanvasRef.current
    if (!img || !canvas || !img.naturalWidth) return
    try {
      const map = imageToHeightmap(img, img.naturalWidth, img.naturalHeight, {
        widthMm,
        reliefMm,
        baseMm,
        maxSamples: Math.min(maxSamples, 220),
        mode,
        invert,
      })
      drawHeightmapPreview(canvas, map)
    } catch {
      // preview is best-effort
    }
  }, [widthMm, reliefMm, baseMm, maxSamples, mode, invert])

  useEffect(() => {
    if (!previewUrl || !imageSize) return
    refreshHeightPreview()
  }, [previewUrl, imageSize, refreshHeightPreview])

  const generate = useCallback(async () => {
    const img = imageRef.current
    if (!img?.naturalWidth) {
      setError('Load an image first.')
      return
    }
    setBusy(true)
    setError('')
    setResult(null)
    try {
      await new Promise((r) => setTimeout(r, 30))
      const built = buildStlFromImage(img, img.naturalWidth, img.naturalHeight, {
        widthMm,
        reliefMm,
        baseMm,
        maxSamples,
        mode,
        invert,
      })
      setResult(built)
      refreshHeightPreview()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to build STL')
    } finally {
      setBusy(false)
    }
  }, [widthMm, reliefMm, baseMm, maxSamples, mode, invert, refreshHeightPreview])

  const downloadStl = useCallback(() => {
    if (!result) return
    const base = (fileName || 'model').replace(/\.[^.]+$/, '')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(result.blob)
    a.download = `${base}-3dprint.stl`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2_000)
  }, [result, fileName])

  const closeButton = (
    <button
      type="button"
      onClick={() => goToAdminPanel()}
      className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg border border-tank-light/40 bg-tank-gray/80 text-gray-200 hover:bg-tank-light/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-tank-accent"
      aria-label="Close 3D Print Tool"
      title="Close"
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )

  if (status === 'loading') {
    return (
      <div className="min-h-screen w-full p-4 sm:p-6 flex items-center justify-center text-gray-400">
        Loading…
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen w-full p-4 sm:p-6 pb-10">
        <div className="card p-6 border border-red-500/30 bg-red-500/10 relative">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-white mb-2">Admin only</h2>
              <p className="text-sm text-gray-200">
                The 3D Print Tool is available from Admin Panel → Tools. Sign in with an admin account to continue.
              </p>
            </div>
            {closeButton}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full p-4 sm:p-6 pb-10">
      <div className="card space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-white">3D Print Tool</h1>
            <p className="text-sm text-gray-400 mt-1">
              Convert a 2D image into a printable heightmap STL (relief or lithophane). Open the file in your slicer.
            </p>
          </div>
          {closeButton}
        </div>

        <div>
          <label className="block text-sm mb-2 text-gray-300">Select image</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => onSelectFile(e.target.files?.[0] || null)}
            className="text-sm text-gray-200"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {previewUrl && imageSize && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-xl border border-tank-light/20 bg-tank-dark/50 p-4 space-y-4">
                <h2 className="font-medium text-white">Model settings</h2>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <label className="space-y-1">
                    <span className="text-gray-400">Mode</span>
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as ImageToStlMode)}
                      className="w-full rounded-lg border border-tank-light/40 bg-tank-gray px-3 py-2 text-white"
                    >
                      <option value="relief">Relief (bright = tall)</option>
                      <option value="lithophane">Lithophane (dark = thick)</option>
                    </select>
                  </label>
                  <label className="flex items-end gap-2 pb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={invert}
                      onChange={(e) => setInvert(e.target.checked)}
                      className="rounded border-tank-light"
                    />
                    <span className="text-gray-300">Invert heights</span>
                  </label>
                </div>

                <label className="block space-y-1 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>Width</span>
                    <span className="text-white font-semibold tabular-nums">{widthMm} mm</span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={200}
                    step={1}
                    value={widthMm}
                    onChange={(e) => setWidthMm(Number(e.target.value))}
                    className="w-full"
                  />
                </label>

                <label className="block space-y-1 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>Relief height</span>
                    <span className="text-white font-semibold tabular-nums">{reliefMm} mm</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={12}
                    step={0.1}
                    value={reliefMm}
                    onChange={(e) => setReliefMm(Number(e.target.value))}
                    className="w-full"
                  />
                </label>

                <label className="block space-y-1 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>Base thickness</span>
                    <span className="text-white font-semibold tabular-nums">{baseMm} mm</span>
                  </div>
                  <input
                    type="range"
                    min={0.6}
                    max={5}
                    step={0.1}
                    value={baseMm}
                    onChange={(e) => setBaseMm(Number(e.target.value))}
                    className="w-full"
                  />
                </label>

                <label className="block space-y-1 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>Mesh detail</span>
                    <span className="text-white font-semibold tabular-nums">{maxSamples} px</span>
                  </div>
                  <input
                    type="range"
                    min={64}
                    max={320}
                    step={8}
                    value={maxSamples}
                    onChange={(e) => setMaxSamples(Number(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500">Higher = finer STL, larger file, slower generate.</p>
                </label>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={generate}
                    disabled={busy}
                    className="px-4 py-2 rounded-xl bg-tank-accent text-tank-black font-semibold disabled:opacity-50"
                  >
                    {busy ? 'Generating…' : 'Generate STL'}
                  </button>
                  <button
                    type="button"
                    onClick={downloadStl}
                    disabled={!result || busy}
                    className="px-4 py-2 rounded-xl bg-tank-gray text-white font-medium border border-tank-light/40 disabled:opacity-40"
                  >
                    Download STL
                  </button>
                  <button
                    type="button"
                    onClick={clearMedia}
                    disabled={busy}
                    className="px-4 py-2 rounded-xl text-gray-300 hover:text-white disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>

                {result && (
                  <div className="text-sm text-gray-300 space-y-1 border-t border-tank-light/20 pt-3">
                    <p>
                      Size:{' '}
                      <span className="text-white font-semibold">
                        {result.widthMm.toFixed(1)} × {result.depthMm.toFixed(1)} × {result.heightMm.toFixed(2)} mm
                      </span>
                    </p>
                    <p>
                      Mesh:{' '}
                      <span className="text-white font-semibold">
                        {result.samplesX}×{result.samplesY} · {result.triangleCount.toLocaleString()} triangles
                      </span>
                    </p>
                    <p>
                      File:{' '}
                      <span className="text-white font-semibold">{(result.blob.size / 1024).toFixed(0)} KB</span>
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-tank-light/20 bg-tank-dark/50 p-4">
                <h2 className="font-medium text-white mb-2">Source</h2>
                <p className="text-xs text-gray-500 mb-2">
                  {fileName} · {imageSize.width}×{imageSize.height}
                  {imageSize.width > 0 && (
                    <>
                      {' '}
                      · print depth ~{(widthMm * (imageSize.height / imageSize.width)).toFixed(1)} mm
                    </>
                  )}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Source"
                  className="max-h-64 w-auto max-w-full rounded-lg border border-tank-light/20 object-contain bg-black/40"
                />
              </div>

              <div className="rounded-xl border border-tank-light/20 bg-tank-dark/50 p-4">
                <h2 className="font-medium text-white mb-2">Height preview</h2>
                <p className="text-xs text-gray-500 mb-2">Lighter areas are taller on the model.</p>
                <canvas
                  ref={heightCanvasRef}
                  className="max-w-full rounded-lg border border-tank-light/20 bg-black"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            </div>
          </div>
        )}

        {!previewUrl && (
          <p className="text-sm text-gray-500">
            Tip: high-contrast photos work best. For lithophanes, print in translucent filament and backlight the panel.
            Typical FDM: 0.2 mm layers, 100% fill on the relief face.
          </p>
        )}
      </div>
    </div>
  )
}
