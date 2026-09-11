'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

type Point = { x: number; y: number }
type PlaceMode = 'ball' | 'hole'
type BreakSource = 'manual' | 'tilt'
type Vec = { x: number; y: number }

const BREAK_MAX = 100
const TILT_FULL_DEG = 18
const SLOPE_FULL_DEG = 8
/** Low-res grid for green-surface detection (mobile-friendly). */
const MASK_W = 160
const MASK_H = 284

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

function slopeColorRgb(pct: number): [number, number, number] {
  const hex = (() => {
    for (const s of SLOPE_STOPS) if (pct <= s.max) return s.color
    return SLOPE_STOPS[SLOPE_STOPS.length - 1].color
  })()
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function unit(v: Vec): Vec {
  const len = Math.hypot(v.x, v.y) || 1
  return { x: v.x / len, y: v.y / len }
}

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
  const e = 3
  const hx = heightAt(x + e, y, w, h, fall, undulation) - heightAt(x - e, y, w, h, fall, undulation)
  const hy = heightAt(x, y + e, w, h, fall, undulation) - heightAt(x, y - e, w, h, fall, undulation)
  const grad = { x: hx / (2 * e), y: hy / (2 * e) }
  const mag = Math.hypot(grad.x, grad.y)
  const pct = clamp(basePct * (0.45 + mag * 3.2), 0, 8)
  const down = unit({ x: -grad.x, y: -grad.y })
  return { pct, down }
}

/** Putting-green biased grass detector (fairway/rough/sand filtered). */
function greenConfidence(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (max < 28) return 0
  const v = max / 255
  const s = max === 0 ? 0 : d / max
  let h = 0
  if (d > 0) {
    if (max === r) h = (60 * ((g - b) / d) + 360) % 360
    else if (max === g) h = 60 * ((b - r) / d) + 120
    else h = 60 * ((r - g) / d) + 240
  }

  // Sand / dirt / sky
  if (h < 55 || h > 175) return 0
  if (s < 0.12 || s > 0.9) return 0
  if (v < 0.18 || v > 0.95) return 0
  if (g < r * 0.92 || g < b * 0.95) return 0

  // Prefer typical green hues; down-weight yellow fringe and blue-green water-ish
  const hueScore = h >= 75 && h <= 155 ? 1 : 0.45
  // Putting surfaces are often a bit smoother/lighter than rough
  const tone = clamp(1 - Math.abs(v - 0.48) * 1.4, 0.35, 1)
  const sat = clamp(1 - Math.abs(s - 0.42) * 1.6, 0.35, 1)
  return clamp(hueScore * tone * sat * (0.55 + s), 0, 1)
}

function blurMask(src: Float32Array, w: number, h: number, passes = 2): Float32Array {
  let a: Float32Array = new Float32Array(src)
  let b: Float32Array = new Float32Array(w * h)
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            const yy = y + dy
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
            sum += a[yy * w + xx]
            n++
          }
        }
        b[y * w + x] = sum / n
      }
    }
    const tmp = a
    a = b
    b = tmp
  }
  return a
}

/** Soft weight toward the putt corridor so fringe/fairway fades out. */
function corridorWeight(
  x: number,
  y: number,
  w: number,
  h: number,
  ball: Point | null,
  hole: Point | null,
): number {
  if (!ball || !hole) {
    // Soft vignette toward middle of the green view when markers aren't set
    const nx = (x / w - 0.5) * 2
    const ny = (y / h - 0.42) * 2
    return clamp(1 - Math.hypot(nx * 0.75, ny * 1.05) * 0.55, 0.25, 1)
  }
  const dx = hole.x - ball.x
  const dy = hole.y - ball.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const px = -uy
  const py = ux
  const vx = x - ball.x
  const vy = y - ball.y
  const along = vx * ux + vy * uy
  const side = vx * px + vy * py
  const t = along / len
  // Wider near the ball, narrower toward the cup (perspective feel)
  const halfW = len * (0.55 - 0.22 * clamp(t, -0.2, 1.2))
  const alongOk = t > -0.35 && t < 1.35
  if (!alongOk) return 0
  const sideNorm = Math.abs(side) / Math.max(24, halfW)
  return clamp(1 - sideNorm * sideNorm, 0, 1)
}

function FlagPin({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`} style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))' }}>
      <line x1={0} y1={0} x2={0} y2={28} stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} />
      <circle r={17} fill="#111" stroke="#fff" strokeWidth={2.5} />
      <path d="M -3 -6 L -3 7 M -3 -5 L 9 -2 L -3 2 Z" fill="#fff" stroke="none" />
    </g>
  )
}

export default function GreenReadPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const heatRef = useRef<HTMLCanvasElement>(null)
  const sampleRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const fallRef = useRef<Vec>({ x: 0.15, y: 0.65 })
  const slopePctRef = useRef(3)
  const undulationRef = useRef(0.18)
  const showStatusRef = useRef(true)
  const ballRef = useRef<Point | null>(null)
  const holeRef = useRef<Point | null>(null)
  const stageSizeRef = useRef({ w: 390, h: 700 })

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
  const [, setStageSize] = useState({ w: 390, h: 700 })
  const [surfaceLocked, setSurfaceLocked] = useState(false)
  const surfaceLockedRef = useRef(false)

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
      const next = { w: Math.max(1, r.width), h: Math.max(1, r.height) }
      stageSizeRef.current = next
      setStageSize(next)
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

      const fallX = clamp(roll / TILT_FULL_DEG, -1, 1)
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

  const fall = useMemo(() => {
    if (breakSource === 'tilt') return tiltFall
    if (ball && hole) {
      const dx = hole.x - ball.x
      const dy = hole.y - ball.y
      const len = Math.hypot(dx, dy) || 1
      const px = -dy / len
      const py = dx / len
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

  useEffect(() => {
    fallRef.current = fall
    slopePctRef.current = slopePct
    undulationRef.current = undulation
    showStatusRef.current = showStatus
    ballRef.current = ball
    holeRef.current = hole
  }, [fall, slopePct, undulation, showStatus, ball, hole])

  // Live overlay: mask to detected green surface (no fixed trapezoid).
  useEffect(() => {
    if (!cameraReady) return
    const video = videoRef.current
    const out = heatRef.current
    if (!video || !out) return

    if (!sampleRef.current) sampleRef.current = document.createElement('canvas')
    const sample = sampleRef.current
    sample.width = MASK_W
    sample.height = MASK_H
    const sctx = sample.getContext('2d', { willReadFrequently: true })
    const octx = out.getContext('2d')
    if (!sctx || !octx) return

    let raf = 0
    let alive = true
    let lastMask: Float32Array | null = null

    const paint = () => {
      if (!alive) return
      raf = requestAnimationFrame(paint)

      const { w: sw, h: sh } = stageSizeRef.current
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (out.width !== Math.floor(sw * dpr) || out.height !== Math.floor(sh * dpr)) {
        out.width = Math.floor(sw * dpr)
        out.height = Math.floor(sh * dpr)
        out.style.width = `${sw}px`
        out.style.height = `${sh}px`
      }
      octx.setTransform(dpr, 0, 0, dpr, 0, 0)
      octx.clearRect(0, 0, sw, sh)

      if (!showStatusRef.current) {
        if (surfaceLockedRef.current) {
          surfaceLockedRef.current = false
          setSurfaceLocked(false)
        }
        return
      }
      if (video.readyState < 2 || video.videoWidth < 2) return

      // object-cover sample of the live camera into a small buffer
      const vw = video.videoWidth
      const vh = video.videoHeight
      const cover = Math.max(MASK_W / vw, MASK_H / vh)
      const dw = vw * cover
      const dh = vh * cover
      sctx.clearRect(0, 0, MASK_W, MASK_H)
      sctx.drawImage(video, (MASK_W - dw) / 2, (MASK_H - dh) / 2, dw, dh)
      const frame = sctx.getImageData(0, 0, MASK_W, MASK_H)
      const data = frame.data

      const raw = new Float32Array(MASK_W * MASK_H)
      let greenSum = 0
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const c = greenConfidence(data[i], data[i + 1], data[i + 2])
        raw[p] = c
        greenSum += c
      }
      const soft = blurMask(raw, MASK_W, MASK_H, 2)
      lastMask = soft
      const locked = greenSum / (MASK_W * MASK_H) > 0.04
      if (locked !== surfaceLockedRef.current) {
        surfaceLockedRef.current = locked
        setSurfaceLocked(locked)
      }

      const fallV = fallRef.current
      const basePct = slopePctRef.current
      const und = undulationRef.current
      const ballP = ballRef.current
      const holeP = holeRef.current

      // Heatmap pixels on the green surface only
      const heat = octx.createImageData(MASK_W, MASK_H)
      const hd = heat.data
      for (let y = 0; y < MASK_H; y++) {
        for (let x = 0; x < MASK_W; x++) {
          const idx = y * MASK_W + x
          const m = soft[idx]
          if (m < 0.12) continue
          const sx = ((x + 0.5) / MASK_W) * sw
          const sy = ((y + 0.5) / MASK_H) * sh
          const focus = corridorWeight(sx, sy, sw, sh, ballP, holeP)
          const a = m * focus
          if (a < 0.08) continue
          const { pct } = localSlope(sx, sy, sw, sh, fallV, und, basePct)
          const [r, g, b] = slopeColorRgb(pct)
          const o = idx * 4
          hd[o] = r
          hd[o + 1] = g
          hd[o + 2] = b
          hd[o + 3] = Math.round(255 * clamp(a * 0.55, 0, 0.62))
        }
      }

      // Upscale soft heatmap to stage (feathered edge → draped look)
      const tmp = sample
      const tctx = sctx
      tctx.putImageData(heat, 0, 0)
      octx.imageSmoothingEnabled = true
      octx.imageSmoothingQuality = 'high'
      octx.drawImage(tmp, 0, 0, MASK_W, MASK_H, 0, 0, sw, sh)

      // Perspective arrow field on the detected surface
      const cols = 10
      const rows = 14
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const u = (col + 0.5) / cols
          const v = (row + 0.35) / rows
          const x = u * sw
          const y = (0.12 + v * 0.78) * sh
          const mx = clamp(Math.floor((x / sw) * MASK_W), 0, MASK_W - 1)
          const my = clamp(Math.floor((y / sh) * MASK_H), 0, MASK_H - 1)
          const m = (lastMask?.[my * MASK_W + mx] ?? 0) * corridorWeight(x, y, sw, sh, ballP, holeP)
          if (m < 0.28) continue
          const { down } = localSlope(x, y, sw, sh, fallV, und, basePct)
          const depth = 0.55 + 0.75 * (y / sh) // nearer arrows larger
          const ang = Math.atan2(down.y, down.x)
          const len = 9 * depth
          octx.save()
          octx.translate(x, y)
          octx.rotate(ang)
          octx.globalAlpha = clamp(0.35 + m * 0.55, 0.35, 0.9)
          octx.fillStyle = '#fff'
          octx.strokeStyle = 'rgba(0,0,0,0.35)'
          octx.lineWidth = 0.7
          octx.beginPath()
          octx.moveTo(len, 0)
          octx.lineTo(-len * 0.45, len * 0.38)
          octx.lineTo(-len * 0.2, 0)
          octx.lineTo(-len * 0.45, -len * 0.38)
          octx.closePath()
          octx.fill()
          octx.stroke()
          octx.restore()
        }
      }
    }

    raf = requestAnimationFrame(paint)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [cameraReady])

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

        <canvas
          ref={heatRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        />

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.28)_100%)]" />

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
          {straight && (
            <path
              d={straight}
              fill="none"
              stroke="rgba(255,255,255,0.3)"
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
                {surfaceLocked ? 'On green surface' : 'Aim at the green'} · ~{slopePct.toFixed(1)}%
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

        <div className="pointer-events-none absolute left-1/2 top-16 w-[90%] -translate-x-1/2 rounded-lg bg-black/50 px-3 py-2 text-center text-xs text-white/90 backdrop-blur-sm sm:top-[4.5rem]">
          {!ball
            ? 'Point at the putting green — status drapes on the grass. Tap ball, then cup to focus the read.'
            : !hole
              ? 'Tap the cup / flag.'
              : 'Overlay follows the green surface · arrows = downhill · colors = slope %'}
        </div>

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
