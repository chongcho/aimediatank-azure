'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { goToAdminPanel } from '@/lib/adminPanelNav'
import {
  buildModelFromImage,
  type GenerateModelResult,
  type ImageToStlMode,
  type PreviewMeshData,
} from '@/lib/imageToStl'

const PrintModelViewer = dynamic(() => import('@/components/PrintModelViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-gray-500">Loading viewer…</div>
  ),
})

type CollectedObject = {
  id: string
  name: string
  url: string
  width: number
  height: number
  file: File
}

type ResolutionPreset = 'standard' | 'high' | 'ultra'

const RESOLUTION_SAMPLES: Record<ResolutionPreset, number> = {
  standard: 128,
  high: 200,
  ultra: 300,
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function ThreeDPrintToolPage() {
  const { data: session, status } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'

  const [objects, setObjects] = useState<CollectedObject[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [resolution, setResolution] = useState<ResolutionPreset>('standard')
  const [mode, setMode] = useState<ImageToStlMode>('relief')
  const [invert, setInvert] = useState(false)
  const [texture, setTexture] = useState(true)
  const [widthMm, setWidthMm] = useState(80)
  const [reliefMm, setReliefMm] = useState(4)
  const [baseMm, setBaseMm] = useState(1.2)
  const [wireframe, setWireframe] = useState(false)

  const [result, setResult] = useState<GenerateModelResult | null>(null)
  const [previewMesh, setPreviewMesh] = useState<PreviewMeshData | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())

  const selected = useMemo(
    () => objects.find((o) => o.id === selectedId) || null,
    [objects, selectedId]
  )

  useEffect(() => {
    return () => {
      for (const obj of objects) URL.revokeObjectURL(obj.url)
      imageCacheRef.current.clear()
    }
    // Only on unmount — objects cleaned individually when removed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadImage = useCallback((obj: CollectedObject) => {
    const cached = imageCacheRef.current.get(obj.id)
    if (cached?.complete && cached.naturalWidth) return Promise.resolve(cached)
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        imageCacheRef.current.set(obj.id, img)
        resolve(img)
      }
      img.onerror = () => reject(new Error('Could not load image'))
      img.src = obj.url
    })
  }, [])

  const addFiles = useCallback(async (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0) return
    setError('')
    const next: CollectedObject[] = []
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith('image/')) continue
      const url = URL.createObjectURL(file)
      try {
        const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
          img.onerror = () => reject(new Error('bad image'))
          img.src = url
        })
        next.push({
          id: newId(),
          name: file.name,
          url,
          width: dims.width,
          height: dims.height,
          file,
        })
      } catch {
        URL.revokeObjectURL(url)
      }
    }
    if (next.length === 0) {
      setError('Add one or more image files (PNG, JPEG, WebP, etc.).')
      return
    }
    setObjects((prev) => [...prev, ...next])
    setSelectedId((cur) => cur || next[0].id)
    setResult(null)
    setPreviewMesh(null)
  }, [])

  const removeObject = useCallback((id: string) => {
    setObjects((prev) => {
      const target = prev.find((o) => o.id === id)
      if (target) URL.revokeObjectURL(target.url)
      imageCacheRef.current.delete(id)
      const next = prev.filter((o) => o.id !== id)
      setSelectedId((cur) => (cur === id ? next[0]?.id ?? null : cur))
      return next
    })
    setResult(null)
    setPreviewMesh(null)
  }, [])

  const generate = useCallback(async () => {
    if (!selected) {
      setError('Add and select an object image first.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const img = await loadImage(selected)
      await new Promise((r) => setTimeout(r, 20))
      const built = buildModelFromImage(
        img,
        img.naturalWidth,
        img.naturalHeight,
        {
          widthMm,
          reliefMm,
          baseMm,
          maxSamples: RESOLUTION_SAMPLES[resolution],
          mode,
          invert,
        },
        texture
      )
      setResult(built)
      setPreviewMesh(built.mesh)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate model')
      setResult(null)
      setPreviewMesh(null)
    } finally {
      setBusy(false)
    }
  }, [selected, loadImage, widthMm, reliefMm, baseMm, resolution, mode, invert, texture])

  const downloadStl = useCallback(() => {
    if (!result || !selected) return
    const base = selected.name.replace(/\.[^.]+$/, '')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(result.blob)
    a.download = `${base}-3dprint.stl`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2_000)
  }, [result, selected])

  const closeButton = (
    <button
      type="button"
      onClick={() => goToAdminPanel()}
      className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10 hover:text-white"
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
      <div className="min-h-screen w-full flex items-center justify-center bg-[#111] text-gray-400">
        Loading…
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen w-full p-6 bg-[#111]">
        <div className="mx-auto max-w-lg rounded-xl border border-red-500/30 bg-red-500/10 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white mb-2">Admin only</h2>
              <p className="text-sm text-gray-200">
                Open this tool from Admin Panel → Tools with an admin account.
              </p>
            </div>
            {closeButton}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[#0e0e0e] text-white flex flex-col">
      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">3D Print Tool</h1>
          <p className="text-xs text-gray-500 truncate">
            Collect object images → generate printable mesh → rotate to review
          </p>
        </div>
        {closeButton}
      </header>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Left: collect + settings */}
        <aside className="w-full lg:w-[340px] xl:w-[380px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-[#161616] overflow-y-auto max-h-[46vh] lg:max-h-none">
          <div className="p-4 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-200">Objects</h2>
                <span className="text-xs text-gray-500">{objects.length}</span>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  void addFiles(e.dataTransfer.files)
                }}
                className="w-full rounded-xl border border-dashed border-white/20 bg-black/30 px-3 py-6 text-sm text-gray-300 hover:border-tank-accent/60 hover:text-white transition-colors"
              >
                Drop or click to add images
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addFiles(e.target.files)
                  e.target.value = ''
                }}
              />

              {objects.length > 0 && (
                <ul className="mt-3 grid grid-cols-3 gap-2">
                  {objects.map((obj) => {
                    const active = obj.id === selectedId
                    return (
                      <li key={obj.id} className="relative group">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(obj.id)
                            setResult(null)
                            setPreviewMesh(null)
                          }}
                          className={`block w-full overflow-hidden rounded-lg border bg-black/40 aspect-square ${
                            active
                              ? 'border-tank-accent ring-1 ring-tank-accent'
                              : 'border-white/10 hover:border-white/30'
                          }`}
                          title={obj.name}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={obj.url} alt="" className="h-full w-full object-cover" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeObject(obj.id)}
                          className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 text-[10px] text-white opacity-0 group-hover:opacity-100"
                          aria-label={`Remove ${obj.name}`}
                        >
                          ×
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              {selected && (
                <p className="mt-2 text-xs text-gray-500 truncate">
                  {selected.name} · {selected.width}×{selected.height}
                </p>
              )}
            </div>

            <div className="space-y-3 border-t border-white/10 pt-4">
              <h2 className="text-sm font-semibold text-gray-200">Generate</h2>

              <div>
                <p className="text-xs text-gray-500 mb-1.5">Resolution</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ['standard', 'Standard'],
                      ['high', 'High'],
                      ['ultra', 'Ultra'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setResolution(id)}
                      className={`rounded-lg px-2 py-2 text-xs font-medium ${
                        resolution === id
                          ? 'bg-tank-accent text-tank-black'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block space-y-1 text-sm">
                <span className="text-xs text-gray-500">Mode</span>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as ImageToStlMode)}
                  className="w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white"
                >
                  <option value="relief">Relief (bright = tall)</option>
                  <option value="lithophane">Lithophane (dark = thick)</option>
                </select>
              </label>

              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={texture}
                    onChange={(e) => setTexture(e.target.checked)}
                    className="rounded border-white/20"
                  />
                  <span className="text-gray-300">Texture</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={invert}
                    onChange={(e) => setInvert(e.target.checked)}
                    className="rounded border-white/20"
                  />
                  <span className="text-gray-300">Invert</span>
                </label>
              </div>

              <label className="block space-y-1 text-sm">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Width</span>
                  <span className="text-gray-300 tabular-nums">{widthMm} mm</span>
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
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Relief height</span>
                  <span className="text-gray-300 tabular-nums">{reliefMm} mm</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={16}
                  step={0.1}
                  value={reliefMm}
                  onChange={(e) => setReliefMm(Number(e.target.value))}
                  className="w-full"
                />
              </label>

              <label className="block space-y-1 text-sm">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Base</span>
                  <span className="text-gray-300 tabular-nums">{baseMm} mm</span>
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

              {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy || !selected}
                  className="w-full rounded-xl bg-tank-accent px-4 py-2.5 text-sm font-semibold text-tank-black disabled:opacity-40"
                >
                  {busy ? 'Generating…' : 'Generate 3D model'}
                </button>
                <button
                  type="button"
                  onClick={downloadStl}
                  disabled={!result || busy}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  Download STL
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Right: 3D review viewport */}
        <section className="relative flex-1 min-h-0 bg-[#1a1a1a]">
          {previewMesh ? (
            <>
              <PrintModelViewer mesh={previewMesh} wireframe={wireframe} className="absolute inset-0" />

              <div className="absolute left-3 top-3 z-10 rounded-lg border border-white/10 bg-black/55 backdrop-blur-sm px-3 py-2 text-xs text-gray-300 space-y-0.5 pointer-events-none">
                <p>
                  Topology <span className="text-white">Triangle</span>
                </p>
                <p>
                  Faces <span className="text-white tabular-nums">{result?.triangleCount.toLocaleString()}</span>
                </p>
                <p>
                  Vertices{' '}
                  <span className="text-white tabular-nums">{previewMesh.vertexCount.toLocaleString()}</span>
                </p>
                <p>
                  Size{' '}
                  <span className="text-white tabular-nums">
                    {result
                      ? `${result.widthMm.toFixed(0)}×${result.depthMm.toFixed(0)}×${result.heightMm.toFixed(1)} mm`
                      : '—'}
                  </span>
                </p>
                <p className="text-emerald-400 pt-1">Printable STL ready</p>
              </div>

              <div className="absolute right-3 top-3 z-10 flex gap-2">
                <button
                  type="button"
                  onClick={() => setWireframe((w) => !w)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    wireframe
                      ? 'border-tank-accent bg-tank-accent/20 text-tank-accent'
                      : 'border-white/15 bg-black/55 text-gray-200 hover:bg-black/70'
                  }`}
                >
                  Wireframe
                </button>
              </div>

              <p className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[11px] text-gray-400 pointer-events-none">
                Drag to rotate · Scroll to zoom · Right-drag to pan
              </p>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="h-16 w-16 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
                <svg className="h-8 w-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 0v18M4 7.5l8 4.5 8-4.5"
                  />
                </svg>
              </div>
              <p className="text-sm text-gray-400 max-w-sm">
                Add object photos on the left, then generate a 3D model. The mesh appears here — rotate it freely to
                review before downloading STL.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
