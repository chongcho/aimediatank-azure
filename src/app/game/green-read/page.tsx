'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

type Point = { x: number; y: number }
type PlaceMode = 'ball' | 'hole'
type BreakSource = 'manual' | 'tilt'
type Vec = { x: number; y: number }

const BREAK_MAX = 100
/** Degrees of phone roll mapped to full break. */
const TILT_FULL_DEG = 18
/** Phone pitch degrees mapped to ~6% slope. */
const SLOPE_FULL_DEG = 8

const SLOPE_STOPS: { max: number; color: string; label: string }[] = [
  { max: 1, color: '#f4f4f5', label: '0-1%' },
  { max: 2, color: '#7dd3fc', label: '1-2%' },
  { max: 3, color: '#4ade80', label: '2-3%' },
  { max: 4, color: '#facc15', label: '3-4%' },
  { max: 5, color: '#fb923c', label: '4-5%' },
  { max: 99, color: '#ef4444', label: '6%+' },
]

async function openRearCamera(): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    },
    { video: { facingMode: 'environment' }, audio: false },
    { video: true, audio: false },
  ]
  let lastErr: unknown
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function breakLabel(breakAmt: number) {
  if (Math.abs(breakAmt) < 3) return 'Straight'
  return breakAmt < 0 ? `Left ${Math.abs(Math.round(breakAmt))}` : `Right ${Math.round(breakAmt)}`
}

function slopeColor(pct: number): string {
  for (const s of SLOPE_STOPS) {
    if (pct <= s.max) return s.color
  }
  return SLOPE_STOPS[SLOPE_STOPS.length - 1].color
}

function hexToRgba(hex: string, a: number) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${a})`
}

function unit(v: Vec): Vec {
  const len = Math.hypot(v.x, v.y) || 1
  return { x: v.x / len, y: v.y / len }
}

/** Quadratic curve from ball → hole with lateral break at mid-putt. */
function buildBreakPath(ball: Point, hole: Point, breakAmt: number): string {
  const mx = (ball.x + hole.x) / 2
  const my = (ball.y + hole.y) / 2
  const dx = hole.x - ball.x
  const dy = hole.y - ball.y
  const len = Math.hypot(dx, dy) || 1
  const px = -dy / len
  const py = dx / len
  const offset = (breakAmt / BREAK_MAX) * (len * 0.35)
  const cx = mx + px * offset
  const cy = my + py * offset
  return `M ${ball.x} ${ball.y} Q ${cx} ${cy} ${hole.x} ${hole.y}`
}

function startAimPoint(ball: Point, hole: Point, breakAmt: number): Point {
  const mx = (ball.x + hole.x) / 2
  const my = (ball.y + hole.y) / 2
  const dx = hole.x - ball.x
  const dy = hole.y - ball.y
  const len = Math.hypot(dx, dy) || 1
  const px = -dy / len
  const py = dx / len
  const offset = (breakAmt / BREAK_MAX) * (len * 0.35)
  const cx = mx + px * offset
  const cy = my + py * offset
  const tx = cx - ball.x
  const ty = cy - ball.y
  const tLen = Math.hypot(tx, ty) || 1
  const aimLen = Math.min(72, len * 0.28)
  return {
    x: ball.x + (tx / tLen) * aimLen,
    y: ball.y + (ty / tLen) * aimLen,
  }
}

/** Perspective-ish green footprint for the status overlay. */
function greenPolygon(w: number, h: number, ball: Point | null, hole: Point | null): Point[] {
  if (ball && hole) {
    const dx = hole.x - ball.x
    const dy = hole.y - ball.y
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const px = -uy
    const py = ux
    const nearW = Math.min(w * 0.42, len * 0.95)
    const farW = Math.min(w * 0.28, len * 0.55)
    const back = 0.22 * len
    const ahead = 0.28 * len
    const near = { x: ball.x - ux * back, y: ball.y - uy * back }
    const far = { x: hole.x + ux * ahead, y: hole.y + uy * ahead }
    return [
      { x: near.x + px * nearW, y: near.y + py * nearW },
      { x: near.x - px * nearW, y: near.y - py * nearW },
      { x: far.x - px * farW, y: far.y - py * farW },
      { x: far.x + px * farW, y: far.y + py * farW },
    ]
  }
  // Default: looking down the green from behind the ball
  return [
    { x: w * 0.06, y: h * 0.78 },
    { x: w * 0.94, y: h * 0.78 },
    { x: w * 0.72, y: h * 0.22 },
    { x: w * 0.28, y: h * 0.22 },
  ]
}

function pointInPoly(p: Point, poly: Point[]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    const intersect =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-9) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Synthetic height field: overall fall from phone/manual slope, plus mild undulation
 * so the heatmap/arrows look like a real green (assistive estimate, not a survey).
 */
function heightAt(x: number, y: number, w: number, h: number, fall: Vec, undulation: number) {
  const nx = x / w - 0.5
  const ny = y / h - 0.5
  const planar = fall.x * nx + fall.y * ny
  const wave =
    undulation *
    (0.55 * Math.sin(nx * 5.2 + ny * 2.1) +
      0.35 * Math.cos(nx * 3.4 - ny * 4.6) +
      0.25 * Math.sin((nx + ny) * 6.8))
  return planar * 2.2 + wave
}

function localSlope(
  x: number,
  y: number,
  w: number,
  h: number,
  fall: Vec,
  undulation: number,
  basePct: number,
) {
  const e = 4
  const hx = heightAt(x + e, y, w, h, fall, undulation) - heightAt(x - e, y, w, h, fall, undulation)
  const hy = heightAt(x, y + e, w, h, fall, undulation) - heightAt(x, y - e, w, h, fall, undulation)
  const grad = { x: hx / (2 * e), y: hy / (2 * e) }
  const mag = Math.hypot(grad.x, grad.y)
  // Downhill = opposite gradient; scale to % for coloring
  const pct = clamp(basePct * (0.45 + mag * 3.2), 0, 8)
  const down = unit({ x: -grad.x, y: -grad.y })
  return { pct, down }
}

function FlagPin({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`} style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))' }}>
      <circle r={18} fill="#111" stroke="#fff" strokeWidth={2.5} />
      <path d="M -3 -6 L -3 7 M -3 -5 L 9 -2 L -3 2 Z" fill="#fff" stroke="none" />
    </g>
  )
}

export default function GreenReadPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const heatRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  const [cameraError, setCameraError] = useState('')
  const [cameraReady, setCameraReady] = useState(false)
  const [placeMode, setPlaceMode] = useState<PlaceMode>('ball')
  const [ball, setBall] = useState<Point | null>(null)
  const [hole, setHole] = useState<Point | null>(null)
  const [breakAmt, setBreakAmt] = useState(0)
  const [breakSource, setBreakSource] = useState<BreakSource>('manual')
  const [tiltSupported, setTiltSupported] = useState(false)
  const [tiltPermission, setTiltPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown')
  const [tiltLive, setTiltLive] = useState(0)
  const [tiltFall, setTiltFall] = useState<Vec>({ x: 0.15, y: 0.55 })
  const [tiltSlopePct, setTiltSlopePct] = useState(2.5)
  const [manualSlopePct, setManualSlopePct] = useState(3)
  const [dragging, setDragging] = useState<'ball' | 'hole' | null>(null)
  const [showStatus, setShowStatus] = useState(true)
  const [stageSize, setStageSize] = useState({ w: 390, h: 700 })

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const startCamera = useCallback(async () => {
    setCameraError('')
    setCameraReady(false)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera not available in this browser')
      }
      stopCamera()
      const stream = await openRearCamera()
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }
      setCameraReady(true)
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Camera permission denied. Allow camera access to use Green Read on the course.'
      setCameraError(msg)
      setCameraReady(false)
    }
  }, [stopCamera])

  useEffect(() => {
    void startCamera()
    return () => {
      stopCamera()
      void wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [startCamera, stopCamera])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setStageSize({ w: Math.max(1, r.width), h: Math.max(1, r.height) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!cameraReady || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let cancelled = false
    const request = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void lock.release()
          return
        }
        wakeLockRef.current = lock
      } catch {
        // ignore
      }
    }
    void request()
    const onVis = () => {
      if (document.visibilityState === 'visible') void request()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      void wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [cameraReady])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const hasOrientation = 'DeviceOrientationEvent' in window
    setTiltSupported(hasOrientation)
    if (!hasOrientation) return

    const onOrient = (ev: DeviceOrientationEvent) => {
      const angle =
        typeof screen !== 'undefined' && screen.orientation?.angle != null
          ? screen.orientation.angle
          : 0
      const landscape = Math.abs(angle) === 90
      const roll = landscape ? (ev.beta ?? 0) : (ev.gamma ?? 0)
      const pitch = landscape ? (ev.gamma ?? 0) : (ev.beta ?? 0)
      const mapped = clamp((-roll / TILT_FULL_DEG) * BREAK_MAX, -BREAK_MAX, BREAK_MAX)
      setTiltLive(mapped)
      if (breakSource === 'tilt') setBreakAmt(mapped)

      // Project phone tilt into a screen-space "fall" direction for the green overlay.
      const fallX = clamp(roll / TILT_FULL_DEG, -1, 1)
      // Holding phone to look at green: beta ~40–70; deviation from ~55° ≈ pitch slope toward/away.
      const fallY = clamp((pitch - 55) / SLOPE_FULL_DEG, -1, 1)
      const fall = unit({ x: fallX, y: Math.max(0.2, 0.55 + fallY * 0.45) })
      setTiltFall(fall)
      const mag = Math.hypot(fallX, fallY)
      setTiltSlopePct(clamp(1.2 + mag * 5.5, 0.5, 8))
    }

    window.addEventListener('deviceorientation', onOrient)
    return () => window.removeEventListener('deviceorientation', onOrient)
  }, [breakSource])

  const enableTilt = useCallback(async () => {
    try {
      const DOE = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>
      }
      if (typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission()
        setTiltPermission(res)
        if (res !== 'granted') return
      } else {
        setTiltPermission('granted')
      }
      setBreakSource('tilt')
      setBreakAmt(tiltLive)
    } catch {
      setTiltPermission('denied')
    }
  }, [tiltLive])

  const { w, h } = stageSize

  const fall = useMemo(() => {
    if (breakSource === 'tilt') return tiltFall
    if (ball && hole) {
      const dx = hole.x - ball.x
      const dy = hole.y - ball.y
      const len = Math.hypot(dx, dy) || 1
      const px = -dy / len
      const py = dx / len
      // Positive break = fall to the right of the putt line
      const side = breakAmt / BREAK_MAX
      return unit({
        x: px * side + (dx / len) * 0.15,
        y: py * side + (dy / len) * 0.35 + 0.35,
      })
    }
    return unit({ x: breakAmt / BREAK_MAX, y: 0.65 })
  }, [ball, hole, breakAmt, breakSource, tiltFall])

  const slopePct = breakSource === 'tilt' ? tiltSlopePct : manualSlopePct
  const undulation = 0.12 + (slopePct / 8) * 0.18

  const poly = useMemo(() => greenPolygon(w, h, ball, hole), [w, h, ball, hole])

  const arrows = useMemo(() => {
    if (!showStatus) return [] as { x: number; y: number; angle: number; pct: number }[]
    const cols = 9
    const rows = 11
    const items: { x: number; y: number; angle: number; pct: number }[] = []
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = ((col + 0.5) / cols) * w
        const y = ((row + 0.55) / rows) * h * 0.85 + h * 0.08
        if (!pointInPoly({ x, y }, poly)) continue
        const { pct, down } = localSlope(x, y, w, h, fall, undulation, slopePct)
        items.push({
          x,
          y,
          angle: (Math.atan2(down.y, down.x) * 180) / Math.PI,
          pct,
        })
      }
    }
    return items
  }, [showStatus, w, h, poly, fall, undulation, slopePct])

  // Paint translucent slope heatmap onto the green polygon.
  useEffect(() => {
    const canvas = heatRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    if (!showStatus) return

    ctx.save()
    ctx.beginPath()
    poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.closePath()
    ctx.clip()

    const step = Math.max(10, Math.floor(Math.min(w, h) / 28))
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const cx = x + step / 2
        const cy = y + step / 2
        if (!pointInPoly({ x: cx, y: cy }, poly)) continue
        const { pct } = localSlope(cx, cy, w, h, fall, undulation, slopePct)
        ctx.fillStyle = hexToRgba(slopeColor(pct), 0.42)
        ctx.fillRect(x, y, step + 1, step + 1)
      }
    }

    // Soft blend so it reads like an AR mesh, not a pixel grid
    ctx.globalCompositeOperation = 'source-atop'
    const g = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.85)
    g.addColorStop(0, 'rgba(255,255,255,0.08)')
    g.addColorStop(1, 'rgba(0,0,0,0.12)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.restore()

    // Outline of green status region
    ctx.beginPath()
    poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.closePath()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }, [showStatus, w, h, poly, fall, undulation, slopePct])

  const clientPoint = (clientX: number, clientY: number): Point | null => {
    const el = stageRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      x: clamp(clientX - r.left, 0, r.width),
      y: clamp(clientY - r.top, 0, r.height),
    }
  }

  const nearPoint = (p: Point, target: Point | null, radius = 36) => {
    if (!target) return false
    return Math.hypot(p.x - target.x, p.y - target.y) <= radius
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const p = clientPoint(e.clientX, e.clientY)
    if (!p) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)

    if (nearPoint(p, ball)) {
      setDragging('ball')
      setBall(p)
      return
    }
    if (nearPoint(p, hole)) {
      setDragging('hole')
      setHole(p)
      return
    }

    if (placeMode === 'ball' || !ball) {
      setBall(p)
      setPlaceMode('hole')
    } else {
      setHole(p)
      setPlaceMode('ball')
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const p = clientPoint(e.clientX, e.clientY)
    if (!p) return
    if (dragging === 'ball') setBall(p)
    else setHole(p)
  }

  const onPointerUp = () => setDragging(null)

  const resetMarks = () => {
    setBall(null)
    setHole(null)
    setPlaceMode('ball')
    setBreakAmt(0)
    setBreakSource('manual')
  }

  const path = ball && hole ? buildBreakPath(ball, hole, breakAmt) : null
  const aim = ball && hole ? startAimPoint(ball, hole, breakAmt) : null
  const straight = ball && hole ? `M ${ball.x} ${ball.y} L ${hole.x} ${hole.y}` : null

  return (
    <div className="fixed inset-0 z-[40] bg-black text-white sm:relative sm:inset-auto sm:min-h-screen sm:z-auto">
      <div
        ref={stageRef}
        className="relative mx-auto h-[100dvh] w-full max-w-lg touch-none select-none overflow-hidden bg-black sm:h-[min(100dvh,860px)] sm:rounded-xl sm:border sm:border-white/10"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Green status heatmap (AR-style overlay on the green) */}
        <canvas
          ref={heatRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        />

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.4)_100%)]" />

        {!cameraReady && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white/80">
            Opening rear camera…
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center">
            <p className="text-base text-red-300">{cameraError}</p>
            <p className="max-w-sm text-sm text-white/70">
              On a real green, use the rear camera and stand behind the ball looking toward the cup.
            </p>
            <button
              type="button"
              onClick={() => void startCamera()}
              className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold"
            >
              Retry camera
            </button>
          </div>
        )}

        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {/* Break direction arrows */}
          {showStatus &&
            arrows.map((a, i) => (
              <g key={i} transform={`translate(${a.x}, ${a.y}) rotate(${a.angle})`}>
                <polygon
                  points="-5,-4 10,0 -5,4 -2,0"
                  fill="rgba(255,255,255,0.92)"
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth={0.6}
                />
              </g>
            ))}

          {straight && (
            <path
              d={straight}
              fill="none"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={2}
              strokeDasharray="6 8"
            />
          )}
          {path && (
            <path
              d={path}
              fill="none"
              stroke="#fde047"
              strokeWidth={5}
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 2px #000)' }}
            />
          )}
          {ball && aim && (
            <line
              x1={ball.x}
              y1={ball.y}
              x2={aim.x}
              y2={aim.y}
              stroke="#22d3ee"
              strokeWidth={4}
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 2px #000)' }}
            />
          )}
          {ball && (
            <g>
              <circle cx={ball.x} cy={ball.y} r={14} fill="#fff" stroke="#111" strokeWidth={3} />
              <text
                x={ball.x}
                y={ball.y - 22}
                textAnchor="middle"
                fill="#fff"
                fontSize="13"
                fontWeight="700"
                style={{ paintOrder: 'stroke', stroke: '#000', strokeWidth: 3 }}
              >
                BALL
              </text>
            </g>
          )}
          {hole && <FlagPin x={hole.x} y={hole.y} />}
        </svg>

        {/* Top bar */}
        <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link
            href="/game"
            className="pointer-events-auto rounded-lg bg-black/55 px-3 py-2 text-xs font-semibold backdrop-blur-sm"
          >
            ← Games
          </Link>
          <div className="flex flex-col items-end gap-2">
            <div className="rounded-lg bg-black/55 px-3 py-2 text-right backdrop-blur-sm">
              <div className="text-xs font-semibold tracking-wide text-emerald-300">GREEN READ</div>
              <div className="text-[11px] text-white/75">
                Status ~{slopePct.toFixed(1)}% · assistive estimate
              </div>
            </div>
            <button
              type="button"
              className={`pointer-events-auto rounded-lg px-3 py-2 text-xs font-semibold backdrop-blur-sm ${
                showStatus ? 'bg-emerald-500/90 text-black' : 'bg-black/55 text-white'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                setShowStatus((v) => !v)
              }}
            >
              {showStatus ? 'Status on' : 'Status off'}
            </button>
          </div>
        </div>

        {/* Hint */}
        <div className="pointer-events-none absolute left-1/2 top-16 w-[90%] -translate-x-1/2 rounded-lg bg-black/50 px-3 py-2 text-center text-xs text-white/90 backdrop-blur-sm sm:top-[4.5rem]">
          {!ball
            ? 'Aim the camera at the green. Tap the ball, then the cup — status overlay follows the slope.'
            : !hole
              ? 'Tap the cup / flag.'
              : 'Arrows = downhill · colors = slope % · yellow = putt curve'}
        </div>

        {/* Slope legend */}
        {showStatus && (
          <div
            className="pointer-events-none absolute left-3 z-10 rounded-lg bg-black/60 px-2.5 py-2 backdrop-blur-sm"
            style={{ bottom: 'calc(11.5rem + env(safe-area-inset-bottom))' }}
          >
            <div className="mb-1 text-[10px] font-semibold tracking-wide text-white/80">SLOPE</div>
            <div className="flex h-2.5 w-44 overflow-hidden rounded-sm">
              {SLOPE_STOPS.map((s) => (
                <div key={s.label} className="flex-1" style={{ background: s.color }} />
              ))}
            </div>
            <div className="mt-1 flex w-44 justify-between text-[9px] text-white/70">
              {SLOPE_STOPS.map((s) => (
                <span key={s.label}>{s.label}</span>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 space-y-2 bg-gradient-to-t from-black via-black/90 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-10">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setPlaceMode('ball')
              }}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold ${
                placeMode === 'ball' ? 'bg-white text-black' : 'bg-white/15'
              }`}
            >
              Place ball
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setPlaceMode('hole')
              }}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold ${
                placeMode === 'hole' ? 'bg-yellow-300 text-black' : 'bg-white/15'
              }`}
            >
              Place hole
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                resetMarks()
              }}
              className="rounded-lg bg-white/15 px-4 py-2.5 text-sm font-semibold"
            >
              Reset
            </button>
          </div>

          <div
            className="rounded-xl bg-black/55 p-3 backdrop-blur-sm"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{breakLabel(breakAmt)}</span>
              <span className="text-[11px] text-white/60">
                {breakSource === 'tilt' ? 'Tilt live' : 'Manual'}
              </span>
            </div>
            <input
              type="range"
              min={-BREAK_MAX}
              max={BREAK_MAX}
              step={1}
              value={breakAmt}
              onChange={(e) => {
                setBreakSource('manual')
                setBreakAmt(Number(e.target.value))
              }}
              className="h-9 w-full accent-emerald-400"
              aria-label="Break amount"
            />
            {breakSource === 'manual' && (
              <>
                <div className="mb-1 mt-2 flex items-center justify-between text-[11px] text-white/70">
                  <span>Slope steepness</span>
                  <span>{manualSlopePct.toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={8}
                  step={0.1}
                  value={manualSlopePct}
                  onChange={(e) => setManualSlopePct(Number(e.target.value))}
                  className="h-8 w-full accent-orange-400"
                  aria-label="Slope percent"
                />
              </>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setBreakSource('manual')
                  setBreakAmt(0)
                }}
                className="flex-1 rounded-lg bg-white/10 py-2 text-xs font-semibold"
              >
                Straight
              </button>
              {tiltSupported && (
                <button
                  type="button"
                  onClick={() => void enableTilt()}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
                    breakSource === 'tilt' ? 'bg-cyan-400 text-black' : 'bg-white/10'
                  }`}
                >
                  {tiltPermission === 'denied' ? 'Tilt blocked' : 'Use phone tilt'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
