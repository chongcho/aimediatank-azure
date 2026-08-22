'use client'

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { stopAllMedia } from '@/lib/mediaStop'
import { disableVideoTextTracks } from '@/lib/disableVideoTextTracks'
import { isInstalledPWA } from '@/lib/appBadge'
import type { VideoStreamRendition } from '@/lib/videoStreamRenditions'
import { bufferAheadSeconds, pickInitialRenditionIndex, sortRenditions } from '@/lib/adaptiveVideoTier'

/** Above navbar (100010) and safe-area bars (100005) — same stack as voice call fullscreen. */
const IMAGE_FULLSCREEN_Z_INDEX = 100050
const IMAGE_ZOOM_MIN = 1
const IMAGE_ZOOM_MAX = 5
const IMAGE_ZOOM_STEP = 0.5
const IMAGE_DOUBLE_TAP_MS = 280

function clampImageZoom(scale: number) {
  return Math.min(IMAGE_ZOOM_MAX, Math.max(IMAGE_ZOOM_MIN, scale))
}

function touchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number }
) {
  const dx = a.clientX - b.clientX
  const dy = a.clientY - b.clientY
  return Math.hypot(dx, dy)
}

function FullscreenImageOverlay({
  url,
  title,
  containerRef,
  onClose,
}: {
  url: string
  title: string
  containerRef: RefObject<HTMLDivElement>
  onClose: () => void
}) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isGesturing, setIsGesturing] = useState(false)

  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null)
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const lastTapRef = useRef(0)
  const movedRef = useRef(false)

  const commitTransform = (nextScale: number, x: number, y: number) => {
    const clamped = clampImageZoom(nextScale)
    const nextOffset = clamped <= IMAGE_ZOOM_MIN + 0.001 ? { x: 0, y: 0 } : { x, y }
    scaleRef.current = clamped
    offsetRef.current = nextOffset
    setScale(clamped)
    setOffset(nextOffset)
  }

  const zoomBy = (delta: number) => {
    commitTransform(scaleRef.current + delta, offsetRef.current.x, offsetRef.current.y)
  }

  const onTouchStart = (e: ReactTouchEvent) => {
    movedRef.current = false
    if (e.touches.length === 2) {
      panRef.current = null
      setIsGesturing(true)
      pinchRef.current = {
        startDist: touchDistance(e.touches[0], e.touches[1]),
        startScale: scaleRef.current,
      }
      return
    }
    if (e.touches.length === 1 && scaleRef.current > 1) {
      pinchRef.current = null
      setIsGesturing(true)
      panRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        originX: offsetRef.current.x,
        originY: offsetRef.current.y,
      }
    }
  }

  const finishTapOrDoubleTap = () => {
    if (movedRef.current) return
    const now = Date.now()
    if (now - lastTapRef.current < IMAGE_DOUBLE_TAP_MS) {
      lastTapRef.current = 0
      if (scaleRef.current > 1.05) {
        commitTransform(1, 0, 0)
      } else {
        commitTransform(2.5, 0, 0)
      }
    } else {
      lastTapRef.current = now
      window.setTimeout(() => {
        if (lastTapRef.current !== now) return
        if (scaleRef.current <= 1.05) onClose()
      }, IMAGE_DOUBLE_TAP_MS)
    }
  }

  const onTouchEnd = (e: ReactTouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null
    if (e.touches.length === 0) {
      panRef.current = null
      setIsGesturing(false)
      finishTapOrDoubleTap()
    }
  }

  const onMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0 || scaleRef.current <= 1) return
    e.preventDefault()
    movedRef.current = false
    setIsGesturing(true)
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y,
    }
  }

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!panRef.current || scaleRef.current <= 1) return
      const dx = e.clientX - panRef.current.startX
      const dy = e.clientY - panRef.current.startY
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedRef.current = true
      commitTransform(scaleRef.current, panRef.current.originX + dx, panRef.current.originY + dy)
    }
    const onMouseUp = () => {
      if (!panRef.current) return
      panRef.current = null
      setIsGesturing(false)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.2 : 0.2
      commitTransform(scaleRef.current + delta, offsetRef.current.x, offsetRef.current.y)
    }

    // Non-passive so pinch/pan can call preventDefault on iOS Safari.
    const onTouchMoveNative = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault()
        movedRef.current = true
        const dist = touchDistance(e.touches[0], e.touches[1])
        const ratio = dist / Math.max(1, pinchRef.current.startDist)
        commitTransform(pinchRef.current.startScale * ratio, offsetRef.current.x, offsetRef.current.y)
        return
      }
      if (e.touches.length === 1 && panRef.current && scaleRef.current > 1) {
        e.preventDefault()
        const dx = e.touches[0].clientX - panRef.current.startX
        const dy = e.touches[0].clientY - panRef.current.startY
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedRef.current = true
        commitTransform(scaleRef.current, panRef.current.originX + dx, panRef.current.originY + dy)
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchmove', onTouchMoveNative, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchmove', onTouchMoveNative)
    }
  }, [containerRef, onClose])

  const zoomed = scale > 1.01

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black flex items-center justify-center touch-none overscroll-none select-none"
      style={{ zIndex: IMAGE_FULLSCREEN_Z_INDEX }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget && !zoomed) onClose()
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onMouseDown={onMouseDown}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="absolute z-10 w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
        style={{
          top: 'max(1rem, env(safe-area-inset-top, 0px))',
          right: 'max(1rem, env(safe-area-inset-right, 0px))',
        }}
        aria-label="Close fullscreen"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div
        className="absolute z-10 flex items-center gap-2"
        style={{
          bottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => zoomBy(-IMAGE_ZOOM_STEP)}
          disabled={scale <= IMAGE_ZOOM_MIN}
          className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors disabled:opacity-40"
          aria-label="Zoom out"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <span className="min-w-[3.25rem] text-center text-sm text-white/90 tabular-nums">
          {`${Math.round(scale * 100)}%`}
        </span>
        <button
          type="button"
          onClick={() => zoomBy(IMAGE_ZOOM_STEP)}
          disabled={scale >= IMAGE_ZOOM_MAX}
          className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors disabled:opacity-40"
          aria-label="Zoom in"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <img
        src={url}
        alt={title}
        className="max-w-full max-h-full w-auto h-auto object-contain will-change-transform"
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
          transformOrigin: 'center center',
          cursor: zoomed ? (isGesturing ? 'grabbing' : 'grab') : 'zoom-in',
          transition: isGesturing ? undefined : 'transform 120ms ease-out',
        }}
        draggable={false}
      />
    </div>
  )
}

interface MediaPlayerProps {
  type: 'VIDEO' | 'IMAGE' | 'MUSIC'
  url: string
  title: string
  thumbnailUrl?: string | null
  /** Multiple progressive URLs (low→high); player picks tier from network + buffer and may switch mid-play. */
  streamRenditions?: VideoStreamRendition[]
  /** When true (e.g. on media detail page), start unmuted and try unmuted autoplay first. */
  autoUnmuteOnMount?: boolean
  /** When true, pause immediately (e.g. share modal open). Ref-synced so async autoplay cannot resume playback. */
  playbackSuspended?: boolean
}

export default function MediaPlayer({
  type,
  url,
  title,
  thumbnailUrl,
  streamRenditions,
  autoUnmuteOnMount,
  playbackSuspended = false,
}: MediaPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  // On media detail (autoUnmuteOnMount): start unmuted. Else mobile browser: start muted for autoplay; desktop/PWA: unmuted.
  const [isMuted, setIsMuted] = useState(
    () =>
      autoUnmuteOnMount
        ? false
        : typeof window !== 'undefined' &&
          (window.innerWidth < 768 || navigator.maxTouchPoints > 0) &&
          !isInstalledPWA()
  )
  const [showMobileControls, setShowMobileControls] = useState(false)
  // Buffering state — true while waiting for enough data to play (initial load + mid-stream stalls)
  const [isBuffering, setIsBuffering] = useState(type === 'VIDEO')
  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fullscreenRef = useRef<HTMLDivElement>(null)
  const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null)
  const playbackSuspendedRef = useRef(playbackSuspended)
  playbackSuspendedRef.current = playbackSuspended

  // Pause as soon as parent requests (e.g. share dialog) — runs before useEffect autoplay so we beat in-flight play() races.
  useLayoutEffect(() => {
    if (!playbackSuspended) return
    try {
      videoRef.current?.pause()
      audioRef.current?.pause()
    } catch {
      // ignore
    }
  }, [playbackSuspended])

  // Stop all video/audio when navigating away. Must run BEFORE Next.js unmounts the page so we actually stop the playing element.
  useEffect(() => {
    const stopOurMedia = () => {
      try {
        if (videoRef.current) {
          videoRef.current.pause()
          videoRef.current.removeAttribute('src')
          videoRef.current.load() // Reset internal state so buffered data cannot restart playback
        }
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.removeAttribute('src')
          audioRef.current.load()
        }
      } catch {
        // ignore
      }
      stopAllMedia()
    }

    // Capture phase so we run before Next.js router — otherwise Back unmounts the page and we never pause the video (audio keeps playing).
    window.addEventListener('popstate', stopOurMedia, true)

    const observer = new MutationObserver(() => {
      if (!videoRef.current?.isConnected && !audioRef.current?.isConnected) {
        stopAllMedia()
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      window.removeEventListener('popstate', stopOurMedia, true)
      observer.disconnect()
      stopOurMedia()
    }
  }, [])

  // Detect mobile screens on mount
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    setIsMounted(true)
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const renditionsKey =
    streamRenditions?.map((r) => `${r.height}\t${r.url}`).join('\n') ?? ''
  const sortedStreamRenditions = useMemo(() => {
    if (!streamRenditions?.length) return []
    return sortRenditions(streamRenditions)
  }, [renditionsKey])

  const useAdaptiveVideo = type === 'VIDEO' && sortedStreamRenditions.length > 1
  const [adaptiveTierIndex, setAdaptiveTierIndex] = useState(0)
  const adaptiveTierRef = useRef(0)
  const seekAfterRenditionSwitchRef = useRef<number | null>(null)
  const lastDowngradeAtRef = useRef(0)

  useEffect(() => {
    adaptiveTierRef.current = adaptiveTierIndex
  }, [adaptiveTierIndex])

  useLayoutEffect(() => {
    seekAfterRenditionSwitchRef.current = null
    if (type !== 'VIDEO' || sortedStreamRenditions.length <= 1) {
      setAdaptiveTierIndex(0)
      adaptiveTierRef.current = 0
      return
    }
    const idx = pickInitialRenditionIndex(sortedStreamRenditions.length)
    adaptiveTierRef.current = idx
    setAdaptiveTierIndex(idx)
  }, [type, url, renditionsKey, sortedStreamRenditions.length])

  const effectiveVideoUrl =
    useAdaptiveVideo && sortedStreamRenditions[adaptiveTierIndex]?.url
      ? sortedStreamRenditions[adaptiveTierIndex].url
      : url

  useEffect(() => {
    if (type !== 'VIDEO' || !useAdaptiveVideo) return
    const t = seekAfterRenditionSwitchRef.current
    if (t == null || !Number.isFinite(t)) return
    seekAfterRenditionSwitchRef.current = null
    const v = videoRef.current
    if (!v) return
    const apply = () => {
      const d = v.duration
      if (Number.isFinite(d) && d > 0.5) {
        v.currentTime = Math.min(Math.max(0, t), Math.max(0, d - 0.25))
      }
      v.play().catch(() => {})
    }
    if (v.readyState >= HTMLMediaElement.HAVE_METADATA) {
      requestAnimationFrame(apply)
    } else {
      v.addEventListener('loadedmetadata', apply, { once: true })
    }
  }, [effectiveVideoUrl, type, useAdaptiveVideo])

  useEffect(() => {
    if (!isMounted || type !== 'VIDEO' || !useAdaptiveVideo) return
    const video = videoRef.current
    if (!video) return

    const tiers = sortedStreamRenditions
    let downTimer: ReturnType<typeof setTimeout> | null = null

    const clearDownTimer = () => {
      if (downTimer) {
        clearTimeout(downTimer)
        downTimer = null
      }
    }

    const onPlaying = () => clearDownTimer()

    const onWaiting = () => {
      clearDownTimer()
      if (adaptiveTierRef.current <= 0) return
      downTimer = setTimeout(() => {
        downTimer = null
        const v = videoRef.current
        if (!v || v.paused) return
        if (bufferAheadSeconds(v) > 2.5) return
        if (adaptiveTierRef.current <= 0) return
        const next = adaptiveTierRef.current - 1
        seekAfterRenditionSwitchRef.current = v.currentTime
        lastDowngradeAtRef.current = Date.now()
        adaptiveTierRef.current = next
        setAdaptiveTierIndex(next)
      }, 900)
    }

    let lastUpgradeCheck = 0
    const onTimeUpdate = () => {
      const v = videoRef.current
      if (!v || v.paused) return
      const now = Date.now()
      if (now - lastUpgradeCheck < 6000) return
      lastUpgradeCheck = now
      if (now - lastDowngradeAtRef.current < 22_000) return
      if (adaptiveTierRef.current >= tiers.length - 1) return
      if (bufferAheadSeconds(v) < 18) return
      seekAfterRenditionSwitchRef.current = v.currentTime
      const next = adaptiveTierRef.current + 1
      adaptiveTierRef.current = next
      setAdaptiveTierIndex(next)
    }

    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('timeupdate', onTimeUpdate)
    return () => {
      clearDownTimer()
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [isMounted, type, useAdaptiveVideo, renditionsKey, sortedStreamRenditions])

  // Autoplay + buffering detection.
  // Call play() immediately so the browser knows we want data NOW (triggers aggressive buffering).
  // Track waiting/playing events to show a YouTube-style loading spinner.
  useEffect(() => {
    const video = videoRef.current
    if (!video || type !== 'VIDEO' || !isMounted) return

    let cancelled = false

    const isMobileBrowser =
      (window.innerWidth < 768 || navigator.maxTouchPoints > 0) &&
      !isInstalledPWA()

    // Buffering event handlers
    const onWaiting = () => { if (!cancelled) setIsBuffering(true) }
    const onPlaying = () => { if (!cancelled) setIsBuffering(false) }
    const onCanPlay = () => { if (!cancelled) setIsBuffering(false) }
    const onSeeking = () => { if (!cancelled) setIsBuffering(true) }
    const onSeeked = () => { if (!cancelled && !video.paused) setIsBuffering(false) }

    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('canplaythrough', onCanPlay)
    video.addEventListener('seeking', onSeeking)
    video.addEventListener('seeked', onSeeked)

    // Try to play immediately — don't wait for canplay.
    // The browser will buffer internally and start as soon as it has enough data.
    // This is faster because play() signals "I need data NOW" to the browser's
    // preload heuristic, whereas canplay waits for the browser's conservative threshold.
    const tryAutoplay = async () => {
      if (cancelled || playbackSuspendedRef.current) return
      // On media detail (autoUnmuteOnMount): try unmuted first even on mobile so sound is on when user lands.
      if (isMobileBrowser && !autoUnmuteOnMount) {
        video.muted = true
        setIsMuted(true)
        try {
          if (!cancelled && !playbackSuspendedRef.current) await video.play()
        } catch (e) {
          console.log('Mobile browser autoplay blocked')
        }
        if (playbackSuspendedRef.current) video.pause()
        return
      }
      try {
        video.muted = false
        setIsMuted(false)
        if (!cancelled && !playbackSuspendedRef.current) await video.play()
      } catch (error) {
        console.log('Unmuted autoplay blocked, falling back to muted')
        video.muted = true
        setIsMuted(true)
        try {
          if (!cancelled && !playbackSuspendedRef.current) await video.play()
        } catch (e) {
          console.log('Autoplay blocked entirely')
        }
      }
      if (playbackSuspendedRef.current) video.pause()
    }

    // Use loadedmetadata instead of canplay — metadata loads much faster (just the
    // header, not video data). Once metadata is loaded, play() will trigger the
    // browser to prioritize buffering and start playback ASAP.
    const onMetadataLoaded = () => {
      if (!cancelled) tryAutoplay()
    }

    if (video.readyState >= 1) {
      // Metadata already available
      tryAutoplay()
    } else {
      video.addEventListener('loadedmetadata', onMetadataLoaded, { once: true })
    }

    return () => {
      cancelled = true
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('canplaythrough', onCanPlay)
      video.removeEventListener('seeking', onSeeking)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('loadedmetadata', onMetadataLoaded)
    }
  }, [type, effectiveVideoUrl, isMounted, autoUnmuteOnMount])

  // Hide embedded captions that Android Chrome shows when scrubbing / opening controls.
  useEffect(() => {
    if (type !== 'VIDEO') return
    const video = videoRef.current
    if (!video) return
    return disableVideoTextTracks(video)
  }, [type, effectiveVideoUrl, isMounted, showMobileControls])

  useEffect(() => {
    if (!isFullscreen) return
    // Native Fullscreen API is unreliable on iOS; overlay-only is the mobile path.
    const canRequestNative =
      typeof document !== 'undefined' &&
      typeof Element !== 'undefined' &&
      'requestFullscreen' in Element.prototype &&
      !/iPhone|iPad|iPod/i.test(navigator.userAgent)
    if (!canRequestNative) return
    const element = fullscreenRef.current
    if (!element || document.fullscreenElement) return
    element.requestFullscreen?.().catch(() => {
      // Overlay remains as fallback when native fullscreen is blocked.
    })
  }, [isFullscreen])

  useEffect(() => {
    if (isFullscreen) {
      document.body.dataset.mediaFullscreen = 'true'
      document.documentElement.dataset.mediaFullscreen = 'true'
    } else {
      delete document.body.dataset.mediaFullscreen
      delete document.documentElement.dataset.mediaFullscreen
    }

    return () => {
      delete document.body.dataset.mediaFullscreen
      delete document.documentElement.dataset.mediaFullscreen
    }
  }, [isFullscreen])

  useEffect(() => {
    if (!isFullscreen) return
    const previousOverflow = document.body.style.overflow
    const previousTouchAction = document.body.style.touchAction
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false)
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {})
        }
      }
    }
    const preventTouchScroll = (e: TouchEvent) => {
      e.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('touchmove', preventTouchScroll, { passive: false })

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.touchAction = previousTouchAction
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('touchmove', preventTouchScroll)
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {})
      }
    }
  }, [isFullscreen])

  const closeFullscreen = () => {
    setIsFullscreen(false)
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {})
    }
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  if (type === 'IMAGE') {
    return (
      <>
        <div className="relative w-full bg-black group flex justify-center">
          <div className="relative max-h-[90vh] lg:max-h-[65vh]">
            <img
              src={url}
              alt={title}
              className="block max-w-full max-h-[90vh] lg:max-h-[65vh] object-contain cursor-pointer"
              onClick={() => setIsFullscreen(true)}
            />
            {/* Fullscreen button */}
            <button
              onClick={() => setIsFullscreen(true)}
              className="absolute bottom-3 right-3 w-10 h-10 rounded-lg bg-black/50 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
              title="View fullscreen"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Fullscreen overlay — pinch / wheel / buttons to zoom; tap to close when not zoomed */}
        {isFullscreen &&
          typeof document !== 'undefined' &&
          createPortal(
            <FullscreenImageOverlay
              url={url}
              title={title}
              containerRef={fullscreenRef}
              onClose={closeFullscreen}
            />,
            document.body
          )}
      </>
    )
  }

  if (type === 'VIDEO') {
    const handleVideoTap = () => {
      // Show controls on tap, hide after 3 seconds
      setShowMobileControls(true)
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current)
      }
      hideControlsTimeout.current = setTimeout(() => {
        setShowMobileControls(false)
      }, 3000)
    }

    return (
      <div className="w-full flex justify-center bg-black">
        <div className="relative w-full max-w-fit">
          {/* Gradient placeholder shown behind video when no thumbnail */}
          {!thumbnailUrl && (
            <div 
              className="absolute inset-0 bg-gradient-to-br from-red-900/50 to-orange-900/50 flex items-center justify-center pointer-events-none"
              style={{ zIndex: 0 }}
            >
              <div className="text-white/30">
                <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          )}
          <video
            ref={videoRef}
            src={effectiveVideoUrl}
            poster={thumbnailUrl || undefined}
            controls={showMobileControls}
            playsInline
            preload="auto"
            autoPlay={!isMobile}
            loop
            muted={isMuted}
            className="w-full max-h-[90vh] lg:max-h-[65vh]"
            style={{ zIndex: 1 }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onClick={handleVideoTap}
            onTouchStart={handleVideoTap}
          />
          {/* YouTube-style loading spinner — shown during initial load and mid-stream buffering */}
          {isBuffering && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ zIndex: 2 }}
            >
              <div className="w-16 h-16 relative">
                <svg className="animate-spin w-full h-full" viewBox="0 0 50 50">
                  <circle
                    cx="25" cy="25" r="20"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="4"
                  />
                  <circle
                    cx="25" cy="25" r="20"
                    fill="none"
                    stroke="white"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray="80, 200"
                    strokeDashoffset="0"
                  />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // MUSIC player
  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-gradient-to-br from-purple-900/50 to-pink-900/50 p-8">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="flex flex-col items-center">
        {/* Album Art / Visualizer Placeholder */}
        <div className="w-48 h-48 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-8 shadow-2xl shadow-purple-500/30">
          <svg className={`w-20 h-20 text-white/80 ${isPlaying ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>

        {/* Title */}
        <h3 className="text-xl font-semibold text-white mb-6">{title}</h3>

        {/* Progress Bar */}
        <div className="w-full max-w-md mb-4">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => {
              const time = parseFloat(e.target.value)
              setCurrentTime(time)
              if (audioRef.current) {
                audioRef.current.currentTime = time
              }
            }}
            className="w-full h-2 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-tank-accent"
          />
          <div className="flex justify-between text-sm text-gray-400 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6">
          {/* Rewind */}
          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = Math.max(0, currentTime - 10)
              }
            }}
            className="p-2 text-white/70 hover:text-white transition-colors"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
            </svg>
          </button>

          {/* Play/Pause */}
          <button
            onClick={() => {
              if (audioRef.current) {
                if (isPlaying) {
                  audioRef.current.pause()
                } else {
                  audioRef.current.play()
                }
              }
            }}
            className="w-16 h-16 rounded-full bg-tank-accent flex items-center justify-center hover:bg-tank-accent/80 transition-colors shadow-lg shadow-tank-accent/30"
          >
            {isPlaying ? (
              <svg className="w-8 h-8 text-tank-black" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-tank-black ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Forward */}
          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = Math.min(duration, currentTime + 10)
              }
            }}
            className="p-2 text-white/70 hover:text-white transition-colors"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
            </svg>
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2 mt-6">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={volume}
            onChange={(e) => {
              const vol = parseFloat(e.target.value)
              setVolume(vol)
              if (audioRef.current) {
                audioRef.current.volume = vol
              }
            }}
            className="w-24 h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
          />
        </div>
      </div>
    </div>
  )
}


