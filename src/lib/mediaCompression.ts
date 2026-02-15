// Client-side media compression utilities

interface CompressionOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number // 0-1 for images
  maxSizeMB?: number
}

/** Admin-configurable quality settings for crop/re-encoding */
export interface QualitySettings {
  imageQuality?: number       // 0.0–1.0
  videoBitrateMbps?: number   // Mbps
  videoFps?: number           // Frames per second
  audioBitrateKbps?: number   // kbps
}

const DEFAULT_IMAGE_OPTIONS: CompressionOptions = {
  maxWidth: 4096,
  maxHeight: 4096,
  quality: 0.95, // High quality - compression done on Azure backend
  maxSizeMB: 50,
}

const DEFAULT_VIDEO_OPTIONS: CompressionOptions = {
  maxWidth: 4096,
  maxHeight: 4096,
  maxSizeMB: 500,
}

/**
 * Compress an image file using Canvas API
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {},
  crop?: { x: number; y: number; width: number; height: number },
  qualitySettings?: QualitySettings
): Promise<File> {
  const opts = { ...DEFAULT_IMAGE_OPTIONS, ...options }
  // Apply admin quality setting if provided
  if (qualitySettings?.imageQuality !== undefined) {
    opts.quality = qualitySettings.imageQuality
  }
  
  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    if (!ctx) {
      reject(new Error('Could not get canvas context'))
      return
    }

    img.onload = () => {
      // Compute source crop (defaults to full image)
      const sourceWidth = img.width
      const sourceHeight = img.height
      const sourceX = crop ? Math.max(0, Math.min(Math.round(crop.x), sourceWidth - 1)) : 0
      const sourceY = crop ? Math.max(0, Math.min(Math.round(crop.y), sourceHeight - 1)) : 0
      const sourceW = crop ? Math.max(1, Math.min(Math.round(crop.width), sourceWidth - sourceX)) : sourceWidth
      const sourceH = crop ? Math.max(1, Math.min(Math.round(crop.height), sourceHeight - sourceY)) : sourceHeight

      // Calculate new dimensions while maintaining aspect ratio (based on cropped region)
      let width = sourceW
      let height = sourceH
      const maxW = opts.maxWidth || 1920
      const maxH = opts.maxHeight || 1080

      if (width > maxW) {
        height = (height * maxW) / width
        width = maxW
      }
      if (height > maxH) {
        width = (width * maxH) / height
        height = maxH
      }

      canvas.width = width
      canvas.height = height

      // Draw and compress
      ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to compress image'))
            return
          }

          // Create new file with same name
          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })

          console.log(
            `Image compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB -> ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`
          )

          resolve(compressedFile)
        },
        'image/jpeg',
        opts.quality || 0.8
      )
    }

    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Compress a video file using MediaRecorder API
 * Note: This re-encodes the video which may take time for large files
 */
export async function compressVideo(
  file: File,
  options: CompressionOptions = {},
  onProgress?: (progress: number) => void,
  crop?: { x: number; y: number; width: number; height: number },
  qualitySettings?: QualitySettings
): Promise<File> {
  const opts = { ...DEFAULT_VIDEO_OPTIONS, ...options }

  // Validate file before processing
  if (!file || file.size === 0) {
    return Promise.reject(new Error('Invalid or empty video file'))
  }

  return new Promise((resolve, reject) => {
    let objectUrl: string
    try {
      objectUrl = URL.createObjectURL(file)
    } catch (e) {
      reject(new Error(`Failed to create blob URL: ${e instanceof Error ? e.message : 'Unknown error'}`))
      return
    }

    // Cleanup function to ensure blob URL is revoked on error
    const cleanup = () => {
      try {
        URL.revokeObjectURL(objectUrl)
      } catch {
        // ignore
      }
    }

    const video = document.createElement('video')
    // Start muted to satisfy autoplay policies.
    // We'll route audio through WebAudio (no audible playback) for recording.
    video.muted = true
    video.volume = 0
    video.playsInline = true
    video.preload = 'auto'
    // Note: Do NOT set crossOrigin for blob URLs - it can cause loading failures

    // IMPORTANT: Set src IMMEDIATELY before any handlers to prevent race conditions
    video.src = objectUrl

    video.onloadedmetadata = async () => {
      try {
        // Calculate source crop and output dimensions
        const sourceVideoWidth = video?.videoWidth || video?.clientWidth
        const sourceVideoHeight = video?.videoHeight || video?.clientHeight
        if (!sourceVideoWidth || !sourceVideoHeight) {
          cleanup()
          reject(new Error('Failed to read video dimensions'))
          return
        }

        const cropX = crop ? Math.max(0, Math.min(crop.x, sourceVideoWidth - 2)) : 0
        const cropY = crop ? Math.max(0, Math.min(crop.y, sourceVideoHeight - 2)) : 0
        const cropW = crop ? Math.max(2, Math.min(crop.width, sourceVideoWidth - cropX)) : sourceVideoWidth
        const cropH = crop ? Math.max(2, Math.min(crop.height, sourceVideoHeight - cropY)) : sourceVideoHeight

        let width = cropW
        let height = cropH
        if (!width || !height) {
          cleanup()
          reject(new Error('Failed to read video dimensions'))
          return
        }
        const maxW = opts.maxWidth || 1920
        const maxH = opts.maxHeight || 1080

        if (width > maxW) {
          height = (height * maxW) / width
          width = maxW
        }
        if (height > maxH) {
          width = (width * maxH) / height
          height = maxH
        }

        // Round to even numbers (required for video encoding)
        width = Math.round(width / 2) * 2
        height = Math.round(height / 2) * 2

        // Round crop values to even pixels as well (safer for yuv)
        const sourceX = Math.round(cropX / 2) * 2
        const sourceY = Math.round(cropY / 2) * 2
        const sourceW = Math.round(Math.min(cropW, sourceVideoWidth - sourceX) / 2) * 2
        const sourceH = Math.round(Math.min(cropH, sourceVideoHeight - sourceY) / 2) * 2

        // Create canvas for drawing frames
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          cleanup()
          reject(new Error('Could not get canvas context'))
          return
        }

        // Create media stream from canvas (video track).
        // Use admin-configured FPS or default to 30.
        const TARGET_FPS = qualitySettings?.videoFps ?? 30
        const stream = canvas.captureStream(TARGET_FPS)

        // Briefly start playback (muted) to satisfy autoplay policies, then immediately pause.
        // This allows us to set up audio routing before the video actually advances.
        video.currentTime = 0
        try {
          await video.play()
          video.pause()
        } catch (e) {
          cleanup()
          reject(new Error('Failed to start video playback for re-encoding (autoplay policy?)'))
          return
        }

        // Attach audio tracks while video is paused.
        // Important: some browsers capture "post-volume" audio, so volume=0 can yield silent recordings.
        // We avoid audible playback by routing via WebAudio without connecting to speakers.
        // Use only ONE method to avoid duplicated/echoed audio.
        let audioCtx: AudioContext | null = null
        let audioTracksAdded = false
        try {
          // Prefer WebAudio routing (works even when captureStream audio is missing/unreliable).
          const AudioContextCtor = (window.AudioContext || (window as any).webkitAudioContext) as
            | (new () => AudioContext)
            | undefined

          if (AudioContextCtor) {
            audioCtx = new AudioContextCtor()
            if (audioCtx.state === 'suspended') {
              await audioCtx.resume().catch(() => {})
            }

            // Route the element into a MediaStreamDestination.
            const sourceNode = audioCtx.createMediaElementSource(video)
            const dest = audioCtx.createMediaStreamDestination()
            sourceNode.connect(dest)
            // Do NOT connect to audioCtx.destination (avoid audible playback)

            // Unmute and set a non-zero volume so decoded audio flows through WebAudio graph.
            video.muted = false
            video.volume = 1

            const destTracks = dest.stream.getAudioTracks()
            if (destTracks.length > 0) {
              destTracks.forEach((track) => stream.addTrack(track))
              console.log(`Added ${destTracks.length} audio track(s) via WebAudio`)
              audioTracksAdded = true
            } else {
              console.log('No audio tracks found via WebAudio (video may be silent)')
            }
          }

          // Only use captureStream as fallback if WebAudio didn't add any tracks
          if (!audioTracksAdded) {
            video.muted = false
            video.volume = 1
            const videoStream =
              (video as any).captureStream?.() || (video as any).mozCaptureStream?.()
            const captureTracks: MediaStreamTrack[] = videoStream ? videoStream.getAudioTracks() : []
            if (captureTracks.length > 0) {
              captureTracks.forEach((track) => stream.addTrack(track))
              console.log(`Added ${captureTracks.length} audio track(s) via captureStream() fallback`)
              audioTracksAdded = true
            }
          }

          if (!audioTracksAdded) {
            console.log('No audio tracks found (video may be silent)')
          }
        } catch (e) {
          console.log('Audio capture failed, continuing without audio:', e)
        }

        // Setup MediaRecorder.
        // IMPORTANT: We prefer MP4 when supported (best compatibility with mobile Safari).
        // If the browser can't record MP4, do NOT force-label the output as WebM.
        const preferredTypes = [
          // MP4 (Safari typically supports this)
          'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
          'video/mp4;codecs="avc1.4D401E,mp4a.40.2"',
          'video/mp4',
          // WebM (Chromium typically supports this)
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=vp9',
          'video/webm',
        ]
        const requestedMimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || ''

        // Calculate target bitrate using admin setting or preserving original quality
        const adminBitrateBps = qualitySettings?.videoBitrateMbps
          ? qualitySettings.videoBitrateMbps * 1_000_000
          : undefined
        const originalBitrate = (file.size * 8) / (video.duration || 1)

        let videoBitrate: number
        if (adminBitrateBps) {
          // Use admin-configured bitrate as the cap
          videoBitrate = Math.max(Math.min(Math.round(originalBitrate * 1.1), adminBitrateBps), 2_000_000)
        } else {
          // Default: preserve original quality, capped at 20 Mbps, minimum 2 Mbps
          videoBitrate = Math.max(Math.min(Math.round(originalBitrate * 1.1), 20_000_000), 2_000_000)
        }

        console.log(`Original bitrate: ${(originalBitrate / 1_000_000).toFixed(2)} Mbps, using: ${(videoBitrate / 1_000_000).toFixed(2)} Mbps`)

        // If we cannot record any known type, fall back to original file.
        if (!requestedMimeType) {
          console.warn('No supported MediaRecorder mimeType found; skipping video re-encode.')
          onProgress?.(100)
          resolve(file)
          return
        }

        const mediaRecorder = new MediaRecorder(stream, {
          ...(requestedMimeType ? { mimeType: requestedMimeType } : {}),
          videoBitsPerSecond: videoBitrate,
          audioBitsPerSecond: (qualitySettings?.audioBitrateKbps ?? 256) * 1000,
        })

        const chunks: Blob[] = []
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data)
          }
        }

        mediaRecorder.onstop = () => {
          const recordedMimeType =
            (mediaRecorder.mimeType && mediaRecorder.mimeType.trim()) ||
            (chunks[0]?.type && chunks[0].type.trim()) ||
            requestedMimeType

          const outputExt =
            recordedMimeType.includes('mp4') ? '.mp4' :
            recordedMimeType.includes('webm') ? '.webm' :
            file.name.match(/\.[^.]+$/)?.[0] || ''

          const blob = new Blob(chunks, { type: recordedMimeType })
          const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, outputExt), {
            type: recordedMimeType,
            lastModified: Date.now(),
          })

          console.log(
            `Video compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB -> ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`
          )

          // Cleanup: remove error handler first to prevent false errors, then cleanup
          video.onerror = null
          try {
            video.pause()
            // Don't set video.src = '' - it triggers onerror with "Empty src"
            URL.revokeObjectURL(objectUrl)
          } catch {
            // ignore
          }

          resolve(compressedFile)
        }

        mediaRecorder.onerror = (e) => reject(e)

        // Reset to beginning, start recording FIRST, then start playback.
        // This ensures we capture the full video from the start.
        video.currentTime = 0
        // Larger timeslice reduces overhead from extremely frequent events.
        mediaRecorder.start(500)

        // ─── Robust frame-drawing loop ───
        // Uses setInterval (NOT requestAnimationFrame) so drawing continues even
        // when the browser tab is backgrounded or the system is under heavy load.
        // requestAnimationFrame is completely paused by browsers in background tabs,
        // which causes the canvas to freeze while MediaRecorder keeps recording,
        // resulting in broken playback speed and incomplete uploads.
        //
        // Additionally uses requestVideoFrameCallback (when available) for
        // frame-accurate capture tied to the video decoder.

        let stopped = false
        let lastProgressPct = -1
        let lastProgressAt = 0
        let lastVideoTime = -1
        let stallCheckTime = Date.now()
        const STALL_TIMEOUT_MS = 15_000      // 15 seconds without progress = stall
        const MAX_ENCODE_MS = 10 * 60 * 1000 // 10 minute hard timeout
        const encodeStartTime = Date.now()

        const stopRecording = () => {
          if (stopped) return
          stopped = true
          try { mediaRecorder.stop() } catch { /* already stopped */ }
        }

        // Core draw function — called from both setInterval and requestVideoFrameCallback
        const draw = () => {
          if (stopped) return
          if (video.ended || (video.paused && video.currentTime > 0)) {
            stopRecording()
            return
          }
          ctx.drawImage(video, sourceX, sourceY, sourceW, sourceH, 0, 0, width, height)

          // Progress reporting (max ~4x/sec)
          if (onProgress && video.duration > 0) {
            const now = Date.now()
            const pct = Math.round((video.currentTime / video.duration) * 100)
            if (pct !== lastProgressPct && now - lastProgressAt >= 250) {
              lastProgressPct = pct
              lastProgressAt = now
              onProgress(pct)
            }
          }
        }

        // 1) setInterval at the target frame rate — keeps running in background tabs
        //    (browsers throttle to ~1 call/sec in background, but that's far better than
        //    requestAnimationFrame which stops entirely).
        const frameIntervalMs = 1000 / TARGET_FPS
        const intervalId = setInterval(() => {
          if (stopped) { clearInterval(intervalId); return }
          draw()

          // Stall detection: if video.currentTime hasn't advanced, check for timeout
          const now = Date.now()
          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime
            stallCheckTime = now
          } else if (now - stallCheckTime > STALL_TIMEOUT_MS) {
            console.warn('Video re-encoding stalled — forcing stop')
            stopRecording()
          }

          // Hard timeout: prevent infinite re-encoding
          if (now - encodeStartTime > MAX_ENCODE_MS) {
            console.warn('Video re-encoding exceeded max time — forcing stop')
            stopRecording()
          }
        }, frameIntervalMs)

        // 2) requestVideoFrameCallback — fires when a new video frame is decoded.
        //    Available in Chrome 83+, Edge 83+, Safari 15.4+.
        //    This gives frame-accurate capture tied to the decoder, not the display.
        const rvfc = (video as any).requestVideoFrameCallback
        if (typeof rvfc === 'function') {
          const onVideoFrame = () => {
            if (stopped) return
            draw()
            ;(video as any).requestVideoFrameCallback(onVideoFrame)
          }
          ;(video as any).requestVideoFrameCallback(onVideoFrame)
        }

        // Start playback
        video.play().then(() => {
          draw() // draw first frame immediately
        }).catch(() => {
          stopRecording()
          cleanup()
          reject(new Error('Failed to resume video playback'))
        })

        // Stop when video ends
        video.onended = () => stopRecording()

        // Cleanup audio context and interval when recording stops
        const originalOnStop = mediaRecorder.onstop
        mediaRecorder.onstop = (ev) => {
          stopped = true
          clearInterval(intervalId)
          try { audioCtx?.close().catch(() => {}) } catch { /* ignore */ }
          originalOnStop?.call(mediaRecorder as any, ev)
        }
      } catch (error) {
        cleanup()
        reject(error)
      }
    }

    video.onerror = () => {
      const mediaError = video.error
      const errorMsg = mediaError?.message || 'Unknown error'
      cleanup()
      reject(new Error(`Failed to load video: ${errorMsg}`))
    }
  })
}

/**
 * Compress media file based on type
 */
export async function compressMedia(
  file: File,
  type: 'IMAGE' | 'VIDEO' | 'MUSIC',
  onProgress?: (progress: number) => void,
  crop?: { x: number; y: number; width: number; height: number },
  qualitySettings?: QualitySettings
): Promise<File> {
  // Skip compression for small files (but NEVER skip if we need to crop)
  if (!crop) {
    const skipSizeMB = type === 'IMAGE' ? 1 : 10
    if (file.size < skipSizeMB * 1024 * 1024) {
      console.log(`File is small (${(file.size / 1024 / 1024).toFixed(2)}MB), skipping compression`)
      return file
    }
  }

  switch (type) {
    case 'IMAGE':
      return compressImage(file, {}, crop, qualitySettings)
    case 'VIDEO':
      // Video crop/trim/transcode is done server-side only; client never applies crop
      return compressVideo(file, {}, onProgress, undefined, qualitySettings)
    case 'MUSIC':
      // Audio compression is complex and usually not needed
      // Return original file
      console.log('Audio compression not supported, using original file')
      return file
    default:
      return file
  }
}

