// Client-side media compression utilities

interface CompressionOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number // 0-1 for images
  maxSizeMB?: number
}

const DEFAULT_IMAGE_OPTIONS: CompressionOptions = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.8,
  maxSizeMB: 5,
}

const DEFAULT_VIDEO_OPTIONS: CompressionOptions = {
  maxWidth: 1920,
  maxHeight: 1080,
  maxSizeMB: 100,
}

/**
 * Compress an image file using Canvas API
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const opts = { ...DEFAULT_IMAGE_OPTIONS, ...options }
  
  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    if (!ctx) {
      reject(new Error('Could not get canvas context'))
      return
    }

    img.onload = () => {
      // Calculate new dimensions while maintaining aspect ratio
      let { width, height } = img
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
      ctx.drawImage(img, 0, 0, width, height)

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
  onProgress?: (progress: number) => void
): Promise<File> {
  const opts = { ...DEFAULT_VIDEO_OPTIONS, ...options }
  
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true

    video.onloadedmetadata = async () => {
      try {
        // Calculate new dimensions
        let { videoWidth: width, videoHeight: height } = video
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

        // Create canvas for drawing frames
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }

        // Create media stream from canvas
        const stream = canvas.captureStream(30) // 30 fps

        // Add audio track if video has audio
        try {
          const audioCtx = new AudioContext()
          const source = audioCtx.createMediaElementSource(video)
          const destination = audioCtx.createMediaStreamDestination()
          source.connect(destination)
          source.connect(audioCtx.destination)
          
          destination.stream.getAudioTracks().forEach(track => {
            stream.addTrack(track)
          })
        } catch (e) {
          // Video might not have audio, continue without it
          console.log('No audio track or audio context unavailable')
        }

        // Setup MediaRecorder with lower bitrate
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 2500000, // 2.5 Mbps
        })

        const chunks: Blob[] = []
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data)
          }
        }

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' })
          const compressedFile = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, '.webm'),
            { type: 'video/webm', lastModified: Date.now() }
          )

          console.log(
            `Video compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB -> ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`
          )

          resolve(compressedFile)
        }

        mediaRecorder.onerror = (e) => reject(e)

        // Start recording
        mediaRecorder.start(100) // Collect data every 100ms

        // Play video and draw frames
        video.currentTime = 0
        await video.play()

        const drawFrame = () => {
          if (video.ended || video.paused) {
            mediaRecorder.stop()
            return
          }

          ctx.drawImage(video, 0, 0, width, height)
          
          if (onProgress) {
            const progress = (video.currentTime / video.duration) * 100
            onProgress(Math.round(progress))
          }

          requestAnimationFrame(drawFrame)
        }

        drawFrame()

        // Stop when video ends
        video.onended = () => {
          mediaRecorder.stop()
        }
      } catch (error) {
        reject(error)
      }
    }

    video.onerror = () => reject(new Error('Failed to load video'))
    video.src = URL.createObjectURL(file)
  })
}

/**
 * Compress media file based on type
 */
export async function compressMedia(
  file: File,
  type: 'IMAGE' | 'VIDEO' | 'MUSIC',
  onProgress?: (progress: number) => void
): Promise<File> {
  // Skip compression for small files
  const skipSizeMB = type === 'IMAGE' ? 1 : 10
  if (file.size < skipSizeMB * 1024 * 1024) {
    console.log(`File is small (${(file.size / 1024 / 1024).toFixed(2)}MB), skipping compression`)
    return file
  }

  switch (type) {
    case 'IMAGE':
      return compressImage(file)
    case 'VIDEO':
      return compressVideo(file, {}, onProgress)
    case 'MUSIC':
      // Audio compression is complex and usually not needed
      // Return original file
      console.log('Audio compression not supported, using original file')
      return file
    default:
      return file
  }
}

