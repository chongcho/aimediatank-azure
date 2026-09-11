'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type Point = { x: number; y: number }
type PlaceMode = 'ball' | 'hole'
type BreakSource = 'manual' | 'tilt'

const BREAK_MAX = 100
/** Degrees of phone roll mapped to full break. */
const TILT_FULL_DEG = 18

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

/** Quadratic curve from ball → hole with lateral break at mid-putt. */
function buildBreakPath(ball: Point, hole: Point, breakAmt: number): string {
  const mx = (ball.x + hole.x) / 2
  const my = (ball.y + hole.y) / 2
  const dx = hole.x - ball.x
  const dy = hole.y - ball.y
  const len = Math.hypot(dx, dy) || 1
  // Perpendicular unit vector (screen coords: +x right, +y down)
  const px = -dy / len
  const py = dx / len
  // Positive break = right relative to putt direction (golfer facing hole)
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
  // Tangent at t≈0 of quadratic Bezier: toward control point
  const tx = cx - ball.x
  const ty = cy - ball.y
  const tLen = Math.hypot(tx, ty) || 1
  const aimLen = Math.min(72, len * 0.28)
  return {
    x: ball.x + (tx / tLen) * aimLen,
    y: ball.y + (ty / tLen) * aimLen,
  }
}

export default function GreenReadPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
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
  const [dragging, setDragging] = useState<'ball' | 'hole' | null>(null)

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

  // Keep screen on while lining up a putt outdoors.
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
        // Unsupported or denied — ignore.
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

  // Device tilt → suggested break (phone roll while aiming at the green).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hasOrientation = 'DeviceOrientationEvent' in window
    setTiltSupported(hasOrientation)
    if (!hasOrientation) return

    const onOrient = (ev: DeviceOrientationEvent) => {
      // Portrait: gamma is left/right roll. Landscape: beta is more useful.
      const angle =
        typeof screen !== 'undefined' && screen.orientation?.angle != null
          ? screen.orientation.angle
          : 0
      const landscape = Math.abs(angle) === 90
      const raw = landscape ? (ev.beta ?? 0) : (ev.gamma ?? 0)
      const mapped = clamp((-raw / TILT_FULL_DEG) * BREAK_MAX, -BREAK_MAX, BREAK_MAX)
      setTiltLive(mapped)
      if (breakSource === 'tilt') setBreakAmt(mapped)
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

  const path =
    ball && hole ? buildBreakPath(ball, hole, breakAmt) : null
  const aim =
    ball && hole ? startAimPoint(ball, hole, breakAmt) : null
  const straight =
    ball && hole ? `M ${ball.x} ${ball.y} L ${hole.x} ${hole.y}` : null

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

        {/* Sunlight-friendly dark vignette so overlays stay readable */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.45)_100%)]" />

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

        {/* Aim overlay */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
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
          {hole && (
            <g>
              <circle cx={hole.x} cy={hole.y} r={16} fill="#111" stroke="#fde047" strokeWidth={3} />
              <circle cx={hole.x} cy={hole.y} r={5} fill="#fde047" />
              <text
                x={hole.x}
                y={hole.y - 24}
                textAnchor="middle"
                fill="#fde047"
                fontSize="13"
                fontWeight="700"
                style={{ paintOrder: 'stroke', stroke: '#000', strokeWidth: 3 }}
              >
                HOLE
              </text>
            </g>
          )}
        </svg>

        {/* Top bar */}
        <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link
            href="/game"
            className="pointer-events-auto rounded-lg bg-black/55 px-3 py-2 text-xs font-semibold backdrop-blur-sm"
          >
            ← Games
          </Link>
          <div className="rounded-lg bg-black/55 px-3 py-2 text-right backdrop-blur-sm">
            <div className="text-xs font-semibold tracking-wide text-emerald-300">GREEN READ</div>
            <div className="text-[11px] text-white/75">Practice assist · not a survey</div>
          </div>
        </div>

        {/* Hint */}
        <div className="pointer-events-none absolute left-1/2 top-16 w-[90%] -translate-x-1/2 rounded-lg bg-black/50 px-3 py-2 text-center text-xs text-white/90 backdrop-blur-sm sm:top-20">
          {!ball
            ? 'Stand behind the ball. Tap the ball on the green.'
            : !hole
              ? 'Tap the cup / hole.'
              : 'Drag markers · dial break · cyan = start aim line'}
        </div>

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 space-y-3 bg-gradient-to-t from-black via-black/90 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-10">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setPlaceMode('ball')
              }}
              className={`flex-1 rounded-lg py-3 text-sm font-semibold ${
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
              className={`flex-1 rounded-lg py-3 text-sm font-semibold ${
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
              className="rounded-lg bg-white/15 px-4 py-3 text-sm font-semibold"
            >
              Reset
            </button>
          </div>

          <div
            className="rounded-xl bg-black/55 p-3 backdrop-blur-sm"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
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
              className="h-10 w-full accent-emerald-400"
              aria-label="Break amount"
            />
            <div className="mt-1 flex justify-between text-[11px] text-white/55">
              <span>← Left break</span>
              <span>Right break →</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setBreakSource('manual')
                  setBreakAmt(0)
                }}
                className="flex-1 rounded-lg bg-white/10 py-2.5 text-xs font-semibold"
              >
                Straight
              </button>
              {tiltSupported && (
                <button
                  type="button"
                  onClick={() => void enableTilt()}
                  className={`flex-1 rounded-lg py-2.5 text-xs font-semibold ${
                    breakSource === 'tilt' ? 'bg-cyan-400 text-black' : 'bg-white/10'
                  }`}
                >
                  {tiltPermission === 'denied' ? 'Tilt blocked' : 'Use phone tilt'}
                </button>
              )}
            </div>
            {breakSource === 'tilt' && (
              <p className="mt-2 text-[11px] leading-snug text-cyan-200/90">
                Hold the phone level with the putt line, then roll left/right to match the slope you see.
                Fine-tune with the slider anytime.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
