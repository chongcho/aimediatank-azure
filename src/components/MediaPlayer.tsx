'use client'

import { useState, useRef, useEffect } from 'react'
import { stopAllMedia } from '@/lib/mediaStop'
import { isInstalledPWA } from '@/lib/appBadge'

interface MediaPlayerProps {
  type: 'VIDEO' | 'IMAGE' | 'MUSIC'
  url: string
  title: string
  thumbnailUrl?: string | null
}

export default function MediaPlayer({ type, url, title, thumbnailUrl }: MediaPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  // Mobile browser only: start muted so autoplay is allowed. PWA and desktop: start unmuted.
  const [isMuted, setIsMuted] = useState(
    () =>
      typeof window !== 'undefined' &&
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
      if (cancelled) return
      if (isMobileBrowser) {
        video.muted = true
        setIsMuted(true)
        try {
          if (!cancelled) await video.play()
        } catch (e) {
          console.log('Mobile browser autoplay blocked')
        }
        return
      }
      try {
        video.muted = false
        setIsMuted(false)
        if (!cancelled) await video.play()
      } catch (error) {
        console.log('Unmuted autoplay blocked, falling back to muted')
        video.muted = true
        setIsMuted(true)
        try {
          if (!cancelled) await video.play()
        } catch (e) {
          console.log('Autoplay blocked entirely')
        }
      }
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
  }, [type, url, isMounted])

  useEffect(() => {
    if (!isFullscreen) return
    const element = fullscreenRef.current
    if (!element) return
    if (document.fullscreenElement) return
    element.requestFullscreen?.().catch(() => {
      // If fullscreen API is unavailable or blocked, fallback to overlay only.
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

        {/* Fullscreen overlay */}
        {isFullscreen && (
          <div
            ref={fullscreenRef}
            className="fixed inset-0 z-[99999] bg-black flex items-center justify-center"
            style={{ width: '100vw', height: '100vh', transform: 'translateY(-22px)' }}
            onClick={() => setIsFullscreen(false)}
          >
            <button
              onClick={() => {
                setIsFullscreen(false)
                if (document.fullscreenElement) {
                  document.exitFullscreen?.()
                }
              }}
              className="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={url}
              alt={title}
              className="w-screen h-screen object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
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
            src={url}
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


