'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { compressMedia, type QualitySettings } from '@/lib/mediaCompression'

type Area = { x: number; y: number; width: number; height: number }

interface UploadQuota {
  membershipType: string
  freeUploads: number | string
  freeUploadsUsed: number
  freeUploadsRemaining: number | string
  paidUploadCredits: number
  bonusCredits: number
  totalCredits: number
  creditsUsed: number
  costPerUpload: number
  nextUploadCost: number
  canUpload: boolean
  statusMessage: string
  statusType: 'free' | 'paid' | 'blocked'
  planDescription: string
}

function UploadPageContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'IMAGE',
    aiTool: '',
    realDevice: '',
    hashtags: '',
    price: '',
    isPublic: true,
  })
  const [file, setFile] = useState<File | null>(null)
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [showCropper, setShowCropper] = useState(false)
  const [cropSource, setCropSource] = useState<string | null>(null)
  const [cropMediaType, setCropMediaType] = useState<'image' | 'video' | null>(null)
  const [cropAreaPixels, setCropAreaPixels] = useState<Area | null>(null)
  const [cropInsets, setCropInsets] = useState({ top: 0, right: 0, bottom: 0, left: 0 })
  const [mediaSize, setMediaSize] = useState<{ width: number; height: number } | null>(null)
  const [renderBox, setRenderBox] = useState<{
    containerWidth: number
    containerHeight: number
    width: number
    height: number
    offsetX: number
    offsetY: number
  } | null>(null)
  const cropContainerRef = useRef<HTMLDivElement | null>(null)
  const minCropSize = 120
  const fileChangeTokenRef = useRef(0)
  const skipCompressionRef = useRef(false)
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null)
  const [videoCrop, setVideoCrop] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadQuota, setUploadQuota] = useState<UploadQuota | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(true)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [uploadPaid, setUploadPaid] = useState(false)
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false)
  const [portalMounted, setPortalMounted] = useState(false)
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null)
  const [cropEnabled, setCropEnabled] = useState(true)
  const [paidQuality, setPaidQuality] = useState<QualitySettings>({})
  const [freeQuality, setFreeQuality] = useState<QualitySettings>({})

  // Pick quality based on whether the media has a price (selling) or not (free)
  const isFreeContent = !formData.price || parseFloat(formData.price) <= 0
  const qualitySettings = isFreeContent ? freeQuality : paidQuality

  // Enable portal rendering after mount (SSR safety)
  useEffect(() => {
    setPortalMounted(true)
  }, [])

  // Fetch admin crop tool settings on mount
  useEffect(() => {
    fetch('/api/ui/crop-settings')
      .then(res => res.json())
      .then(data => {
        if (data.settings) {
          setCropEnabled(data.settings.isEnabled !== false)
          setPaidQuality({
            imageQuality: data.settings.imageQuality,
            videoBitrateMbps: data.settings.videoBitrateMbps,
            videoFps: data.settings.videoFps,
            audioBitrateKbps: data.settings.audioBitrateKbps,
          })
          setFreeQuality({
            imageQuality: data.settings.freeImageQuality,
            videoBitrateMbps: data.settings.freeVideoBitrateMbps,
            videoFps: data.settings.freeVideoFps,
            audioBitrateKbps: data.settings.freeAudioBitrateKbps,
          })
        }
      })
      .catch(() => { /* use defaults */ })
  }, [])

  // Check for payment success on mount - redirect to home since upload is complete
  useEffect(() => {
    const payment = searchParams.get('payment')
    const pendingId = searchParams.get('pending')
    
    if (payment === 'success' && pendingId) {
      // Upload was completed by webhook, redirect to home to see it
      setShowPaymentSuccess(true)
      // Auto-redirect to home after 3 seconds
      const timer = setTimeout(() => {
        router.push('/')
      }, 3000)
      return () => clearTimeout(timer)
    } else if (payment === 'cancelled') {
      setError('Payment was cancelled. Your file was uploaded but not published.')
    }
  }, [searchParams, router])

  // Fetch upload quota on mount
  useEffect(() => {
    if (session?.user) {
      fetchUploadQuota()
    }
  }, [session])

  useEffect(() => {
    if (!descriptionRef.current) return
    descriptionRef.current.style.height = 'auto'
    descriptionRef.current.style.height = `${descriptionRef.current.scrollHeight}px`
  }, [formData.description])

  // Keep crop box in sync with inset sliders.
  // IMPORTANT: must be declared before any early returns to keep hooks order stable.
  useEffect(() => {
    if (!mediaSize || !renderBox) return

    // Clamp each edge independently (no auto-adjusting other edges)
    const left = Math.min(Math.max(0, cropInsets.left), Math.max(0, mediaSize.width - minCropSize - cropInsets.right))
    const right = Math.min(Math.max(0, cropInsets.right), Math.max(0, mediaSize.width - minCropSize - left))
    const top = Math.min(Math.max(0, cropInsets.top), Math.max(0, mediaSize.height - minCropSize - cropInsets.bottom))
    const bottom = Math.min(Math.max(0, cropInsets.bottom), Math.max(0, mediaSize.height - minCropSize - top))

    const width = Math.max(minCropSize, mediaSize.width - left - right)
    const height = Math.max(minCropSize, mediaSize.height - top - bottom)

    setCropAreaPixels({ x: left, y: top, width, height })
  }, [cropInsets, mediaSize, renderBox])

  const fetchUploadQuota = async () => {
    try {
      setQuotaLoading(true)
      const res = await fetch('/api/upload/status')
      if (res.ok) {
        const data = await res.json()
        setUploadQuota(data)
      }
    } catch (err) {
      console.error('Error fetching upload quota:', err)
    } finally {
      setQuotaLoading(false)
    }
  }

  // Handle payment for upload - uploads file first, then redirects to Stripe
  const handlePayForUpload = async () => {
    if (!file) {
      setError('Please select a file to upload')
      setShowPaymentModal(false)
      return
    }

    setPaymentLoading(true)
    setError('')
    
    try {
      // Step 1: Compress the file (skip if user chose "Upload Original")
      let compressedFile: File
      if (skipCompressionRef.current) {
        setUploadStatus('Preparing file...')
        compressedFile = file
      } else {
        setUploadStatus('Compressing file...')
        compressedFile = await compressMedia(
          file,
          formData.type as 'IMAGE' | 'VIDEO' | 'MUSIC',
          (progress) => {
            setUploadStatus(`Compressing... ${progress}%`)
          },
          formData.type === 'VIDEO' ? (videoCrop ?? undefined) : undefined,
          qualitySettings
        )
      }
      
      // Step 2: Upload to Azure Blob Storage
      setUploadStatus('Uploading to cloud storage...')
      const fileUrl = await uploadToAzure(compressedFile, formData.type)
      
      // Upload thumbnail if provided
      let thumbnailUrl = null
      if (thumbnail) {
        setUploadStatus('Uploading thumbnail...')
        const compressedThumbnail = await compressMedia(thumbnail, 'IMAGE', undefined, undefined, qualitySettings)
        thumbnailUrl = await uploadToAzure(compressedThumbnail, 'IMAGE')
      }
      
      // Step 3: Create pending upload and get Stripe payment URL
      setUploadStatus('Preparing payment...')
      const res = await fetch('/api/stripe/upload-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.hashtags ? `${formData.title} ${formData.hashtags}` : formData.title,
          description: formData.description,
          type: formData.type,
          url: fileUrl,
          thumbnailUrl,
          aiTool: formData.aiTool,
          realDevice: formData.realDevice,
          price: formData.price || null,
          isPublic: formData.isPublic,
        }),
      })
      
      const data = await res.json()
      
      if (data.url) {
        // Redirect to Stripe checkout
        window.location.href = data.url
      } else {
        setError(data.error || 'Failed to create payment session')
        setShowPaymentModal(false)
      }
    } catch (err) {
      console.error('Payment error:', err)
      setError('Failed to start payment process')
      setShowPaymentModal(false)
    } finally {
      setPaymentLoading(false)
      setUploadStatus('')
    }
  }

  // Redirect if not subscriber
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  if (!session || (session.user.role !== 'SUBSCRIBER' && session.user.role !== 'ADMIN')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-gray-400 mb-4">Only subscribers can upload media.</p>
          <button
            onClick={() => router.push('/register')}
            className="btn-primary"
          >
            Become a Subscriber
          </button>
        </div>
      </div>
    )
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    console.log('handleFileChange called, file:', selectedFile?.name, selectedFile?.type)
    if (selectedFile) {
      fileChangeTokenRef.current += 1
      const changeToken = fileChangeTokenRef.current
      skipCompressionRef.current = false // reset for new file
      setOriginalFile(selectedFile)
      setFile(selectedFile)
      setThumbnail(null)
      setCropAreaPixels(null)
      setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 })
      setMediaSize(null)
      setRenderBox(null)
      setVideoSize(null)
      setVideoCrop(null)
      
      // Generate preview (show crop tool only if admin has enabled it)
      if (selectedFile.type.startsWith('image/')) {
        console.log('Processing image file for crop')
        const reader = new FileReader()
        reader.onload = () => {
          const src = reader.result as string
          setPreview(src)
          if (cropEnabled) {
            console.log('Image loaded, showing cropper')
            setCropSource(src)
            setCropMediaType('image')
            setShowCropper(true)
          }
        }
        reader.onerror = (err) => {
          console.error('FileReader error:', err)
        }
        reader.readAsDataURL(selectedFile)
      } else if (selectedFile.type.startsWith('video/')) {
        console.log('Processing video file for crop')
        const src = URL.createObjectURL(selectedFile)
        setPreview(src)
        setCropMediaType('video')

        if (!cropEnabled) {
          // Crop disabled — still generate thumbnail for upload but skip crop UI
          generateVideoThumbnail(selectedFile).then(async (thumbFile) => {
            if (fileChangeTokenRef.current !== changeToken) return
            if (thumbFile) setThumbnail(thumbFile)
          })
        } else {
        // Auto-generate thumbnail from video and use it for cropping
        generateVideoThumbnail(selectedFile).then(async (thumbFile) => {
          if (fileChangeTokenRef.current !== changeToken) return
          if (!thumbFile) {
            console.log('No thumbnail generated for video - skipping crop tool')
            setCropSource(null)
            setShowCropper(false)
            // Show a notice that crop is not available
            alert('Video crop tool is not available on this device. You can still upload the video as-is.')
            return
          }
          try {
            const thumbSrc = await readFileAsDataUrl(thumbFile)
            if (fileChangeTokenRef.current !== changeToken) return
            console.log('Video thumbnail loaded, showing cropper')
            setCropSource(thumbSrc)
            setShowCropper(true)
          } catch (err) {
            console.error('Failed to load thumbnail for crop:', err)
            setCropSource(null)
            setShowCropper(false)
            alert('Video crop tool is not available on this device. You can still upload the video as-is.')
          }
        })
        } // end cropEnabled else
      } else {
        console.log('Unknown file type:', selectedFile.type)
        setPreview(null)
        setCropSource(null)
        setCropMediaType(null)
      }
    }
  }

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = (error) => reject(error)
      image.src = url
    })

  const getCroppedImageFile = async (imageSrc: string, cropArea: Area) => {
    const image = await createImage(imageSrc)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    canvas.width = cropArea.width
    canvas.height = cropArea.height
    ctx.drawImage(
      image,
      cropArea.x,
      cropArea.y,
      cropArea.width,
      cropArea.height,
      0,
      0,
      cropArea.width,
      cropArea.height
    )

    return new Promise<File | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(null)
          resolve(new File([blob], 'cropped-image.jpg', { type: 'image/jpeg' }))
        },
        'image/jpeg',
        0.9
      )
    })
  }

  const readFileAsDataUrl = (fileToRead: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(fileToRead)
    })

  const handleUseOriginal = () => {
    setFile(originalFile)
    setShowCropper(false)
    setVideoCrop(null)
    skipCompressionRef.current = true // bypass re-encoding, upload raw file
  }

  const handleUseEdited = async () => {
    skipCompressionRef.current = false
    if (!cropAreaPixels || !cropSource) {
      setShowCropper(false)
      return
    }

    if (cropMediaType === 'image') {
      const croppedFile = await getCroppedImageFile(cropSource, cropAreaPixels)
      if (croppedFile) {
        setFile(croppedFile)
        setPreview(URL.createObjectURL(croppedFile))
      }
    }

    if (cropMediaType === 'video') {
      const croppedThumb = await getCroppedImageFile(cropSource, cropAreaPixels)
      if (croppedThumb) {
        setThumbnail(croppedThumb)
      }
      // Store crop for actual video (client-side re-encode during upload)
      if (mediaSize && videoSize) {
        const ratioX = cropAreaPixels.x / mediaSize.width
        const ratioY = cropAreaPixels.y / mediaSize.height
        const ratioW = cropAreaPixels.width / mediaSize.width
        const ratioH = cropAreaPixels.height / mediaSize.height

        const x = Math.round(ratioX * videoSize.width)
        const y = Math.round(ratioY * videoSize.height)
        const width = Math.round(ratioW * videoSize.width)
        const height = Math.round(ratioH * videoSize.height)
        setVideoCrop({ x, y, width, height })
      }
    }

    setShowCropper(false)
  }

  // Generate thumbnail from video file
  const generateVideoThumbnail = async (videoFile: File): Promise<File | null> => {
    try {
      const video = document.createElement('video')
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true
      video.setAttribute('playsinline', '')
      video.setAttribute('webkit-playsinline', '')
      
      const videoUrl = URL.createObjectURL(videoFile)

      const thumbnailFile = await new Promise<File | null>((resolve) => {
        let resolved = false
        
        // Timeout for mobile browsers where events may not fire
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true
            console.log('Video thumbnail generation timed out')
            URL.revokeObjectURL(videoUrl)
            resolve(null)
          }
        }, 10000) // 10 second timeout

        const cleanup = () => {
          clearTimeout(timeout)
          URL.revokeObjectURL(videoUrl)
        }

        const captureFrame = () => {
          if (resolved) return
          try {
            const sourceWidth = video.videoWidth
            const sourceHeight = video.videoHeight
            if (!sourceWidth || !sourceHeight) {
              console.log('Video dimensions unavailable for thumbnail')
              cleanup()
              resolved = true
              resolve(null)
              return
            }
            setVideoSize({ width: Math.round(sourceWidth), height: Math.round(sourceHeight) })
            const canvas = document.createElement('canvas')
            // Use reasonable thumbnail size
            const maxWidth = 640
            const scale = Math.min(1, maxWidth / sourceWidth)
            canvas.width = sourceWidth * scale
            canvas.height = sourceHeight * scale

            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
              canvas.toBlob(
                (blob) => {
                  if (resolved) return
                  resolved = true
                  cleanup()
                  if (blob) {
                    resolve(new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' }))
                  } else {
                    resolve(null)
                  }
                },
                'image/jpeg',
                0.8
              )
            } else {
              resolved = true
              cleanup()
              resolve(null)
            }
          } catch (err) {
            console.log('Could not generate video thumbnail:', err)
            if (!resolved) {
              resolved = true
              cleanup()
              resolve(null)
            }
          }
        }

        video.onloadedmetadata = () => {
          console.log('Video metadata loaded, duration:', video.duration)
          // Try to seek to a frame
          if (video.duration > 0) {
            video.currentTime = Math.min(1, video.duration * 0.1)
          }
        }

        video.onloadeddata = () => {
          console.log('Video data loaded')
          // On some mobile browsers, onseeked may not fire, so try capturing after loadeddata
          if (video.currentTime === 0 && video.duration > 0) {
            video.currentTime = Math.min(1, video.duration * 0.1)
          }
        }

        video.onseeked = () => {
          console.log('Video seeked to:', video.currentTime)
          captureFrame()
        }

        // Fallback: if video can play, try to capture frame
        video.oncanplay = () => {
          console.log('Video can play')
          // Give a small delay then try to capture if not already done
          setTimeout(() => {
            if (!resolved && video.videoWidth > 0) {
              console.log('Capturing frame from canplay event')
              captureFrame()
            }
          }, 500)
        }

        video.onerror = (e) => {
          console.log('Video thumbnail generation failed:', e)
          if (!resolved) {
            resolved = true
            cleanup()
            resolve(null)
          }
        }

        video.src = videoUrl
        // Try to load the video
        video.load()
      })

      if (thumbnailFile) {
        setThumbnail(thumbnailFile)
        console.log('Auto-generated video thumbnail')
      }

      return thumbnailFile
    } catch (err) {
      console.log('Error generating video thumbnail:', err)
    }
    return null
  }

  // Upload file to Azure Blob Storage using SAS token
  const uploadToAzure = async (fileToUpload: File, fileType: string): Promise<string> => {
    // Step 1: Get SAS token
    setUploadStatus('Getting upload URL...')
    console.log(`Getting SAS URL for: ${fileToUpload.name}, type: ${fileToUpload.type}, size: ${fileToUpload.size}`)
    
    const sasResponse = await fetch('/api/upload/sas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: fileToUpload.name,
        contentType: fileToUpload.type,
        fileType: fileType,
      }),
    })

    if (!sasResponse.ok) {
      const error = await sasResponse.json()
      console.error('SAS token error:', error)
      throw new Error(error.error || 'Failed to get upload URL')
    }

    const { uploadUrl, blobUrl } = await sasResponse.json()
    console.log('Got SAS URL, uploading to Azure...')

    // Step 2: Upload to Azure Blob Storage
    setUploadStatus('Uploading to cloud storage...')
    
    // Use base content type (without codec params) for the upload header
    const baseContentType = fileToUpload.type.split(';')[0].trim()
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': baseContentType,
        'x-ms-blob-cache-control': 'public, max-age=31536000', // Cache for 1 year
      },
      body: fileToUpload,
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      console.error('Azure upload error:', uploadResponse.status, errorText)
      throw new Error(`Failed to upload file to storage: ${uploadResponse.status}`)
    }

    return blobUrl
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!file) {
      setError('Please select a file to upload')
      return
    }

    if (!formData.title.trim()) {
      setError('Please enter a title')
      return
    }

    // Check if payment is required (free uploads exhausted for paid plans)
    // If user has paid credits, they can upload without showing payment modal
    const hasPaidCredits = (uploadQuota?.paidUploadCredits || 0) > 0
    if (uploadQuota?.statusType === 'paid' && !uploadPaid && !hasPaidCredits) {
      setShowPaymentModal(true)
      return
    }

    setLoading(true)
    setUploadProgress(0)

    try {
      // Step 1: Compress the file (skip if user chose "Upload Original")
      let compressedFile: File
      if (skipCompressionRef.current) {
        setUploadStatus('Preparing file...')
        setUploadProgress(5)
        compressedFile = file
        console.log(`Upload Original: bypassing re-encoding, using raw file (${(file.size / 1024 / 1024).toFixed(2)}MB)`)
      } else {
        setUploadStatus('Compressing file...')
        setUploadProgress(5)
        compressedFile = await compressMedia(
          file,
          formData.type as 'IMAGE' | 'VIDEO' | 'MUSIC',
          (progress) => {
            // Map compression progress to 5-30%
            setUploadProgress(5 + Math.round(progress * 0.25))
            setUploadStatus(`Compressing... ${progress}%`)
          },
          formData.type === 'VIDEO' ? (videoCrop ?? undefined) : undefined,
          qualitySettings
        )
        console.log(`Original: ${(file.size / 1024 / 1024).toFixed(2)}MB, Compressed: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB, Type: ${compressedFile.type}`)
      }
      setUploadProgress(30)
      
      // Validate compressed file
      if (!compressedFile || compressedFile.size === 0) {
        throw new Error('Compression failed - file is empty')
      }

      // Step 2: Upload main file to Azure
      console.log('Starting Azure upload...')
      const fileUrl = await uploadToAzure(compressedFile, formData.type)
      console.log('Azure upload complete:', fileUrl)
      setUploadProgress(70)

      // Upload thumbnail if provided (compress it too)
      let thumbnailUrl = null
      if (thumbnail) {
        setUploadStatus('Compressing thumbnail...')
        const compressedThumbnail = await compressMedia(thumbnail, 'IMAGE', undefined, undefined, qualitySettings)
        setUploadStatus('Uploading thumbnail...')
        thumbnailUrl = await uploadToAzure(compressedThumbnail, 'IMAGE')
      }
      setUploadProgress(85)

      // Step 3: Complete upload by creating database record
      setUploadStatus('Saving media...')
      const completeResponse = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.hashtags ? `${formData.title} ${formData.hashtags}` : formData.title,
          description: formData.description,
          type: formData.type,
          url: fileUrl,
          thumbnailUrl,
          aiTool: formData.aiTool,
          realDevice: formData.realDevice,
          price: formData.price || null,
          isPublic: formData.isPublic,
        }),
      })

      setUploadProgress(100)

      const result = await completeResponse.json()

      if (!completeResponse.ok) {
        setError(result.error || 'Failed to save media')
      } else {
        setUploadStatus('Upload complete!')
        router.push(`/media/${result.media.id}`)
      }
    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-0 m-0 pb-[500px]">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Upload AI Media</h1>
        <p className="text-gray-400">
          Share your AI-generated videos, images, or music with the community
        </p>
      </div>

      {/* Payment Success Banner - Upload Complete */}
      {showPaymentSuccess && (
        <div className="mb-6 p-6 bg-green-500/10 border border-green-500/30 rounded-xl text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="font-bold text-green-400 text-2xl mb-2">Upload Complete!</h2>
          <p className="text-gray-300 mb-4">
            Your payment was successful and your media has been published!
          </p>
          <p className="text-gray-400 text-sm">
            Redirecting to home page in 3 seconds...
          </p>
          <button 
            onClick={() => router.push('/')}
            className="mt-4 px-6 py-2 bg-tank-accent text-black font-semibold rounded-lg hover:bg-tank-accent/90 transition-all"
          >
            View Now →
          </button>
        </div>
      )}

      {/* Upload Quota Status Banner */}
      {!quotaLoading && uploadQuota && (
        <div className={`mb-6 p-4 rounded-xl border ${
          uploadQuota.statusType === 'free' 
            ? 'bg-tank-accent/10 border-tank-accent/30' 
            : uploadQuota.statusType === 'paid'
            ? 'bg-yellow-500/10 border-yellow-500/30'
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {uploadQuota.statusType === 'free' ? '🎁' : uploadQuota.statusType === 'paid' ? '💳' : '⚠️'}
              </span>
              <div>
                <p className={`font-semibold ${
                  uploadQuota.statusType === 'free' 
                    ? 'text-tank-accent' 
                    : uploadQuota.statusType === 'paid'
                    ? 'text-yellow-400'
                    : 'text-red-400'
                }`}>
                  {uploadQuota.statusMessage}
                </p>
                <p className="text-sm text-gray-400">
                  {uploadQuota.membershipType} Plan • {uploadQuota.planDescription}
                </p>
              </div>
            </div>
            {uploadQuota.freeUploadsRemaining !== 'Unlimited' && (
              <div className="flex flex-col gap-2">
                {/* Free Uploads Counter */}
                <div className="flex items-center gap-2">
                  <div className="text-center min-w-[60px] px-4 py-2 bg-tank-dark rounded-lg">
                    <p className="text-2xl font-bold text-white">{uploadQuota.freeUploadsUsed}</p>
                    <p className="text-xs text-gray-400">Used</p>
                  </div>
                  <div className="text-gray-500">/</div>
                  <div className="text-center min-w-[60px] px-4 py-2 bg-tank-dark rounded-lg">
                    <p className="text-2xl font-bold text-tank-accent">{uploadQuota.freeUploads}</p>
                    <p className="text-xs text-gray-400">Free</p>
                  </div>
                </div>
                {/* Credits Counter */}
                <div className="flex items-center gap-2">
                  <div className="text-center min-w-[60px] px-4 py-2 bg-tank-dark rounded-lg border border-tank-light">
                    <p className="text-2xl font-bold text-white">{uploadQuota.creditsUsed}</p>
                    <p className="text-xs text-gray-400">Used</p>
                  </div>
                  <div className="text-gray-500">/</div>
                  <div className="text-center min-w-[60px] px-4 py-2 bg-tank-dark rounded-lg border border-tank-light">
                    <p className="text-2xl font-bold text-tank-accent">{uploadQuota.totalCredits + uploadQuota.creditsUsed}</p>
                    <p className="text-xs text-gray-400">Credits</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          {uploadQuota.statusType === 'blocked' && (
            <div className="mt-4 text-center">
              <button
                onClick={() => router.push('/pricing')}
                className="px-6 py-2 bg-tank-accent text-black font-semibold rounded-lg hover:bg-tank-accent/90 transition-all"
              >
                Upgrade Plan to Continue Uploading
              </button>
            </div>
          )}
          {uploadQuota.statusType === 'paid' && (
            <p className="mt-2 text-sm text-yellow-400/80 text-center">
              💡 Upgrade to Premium for unlimited free uploads!
            </p>
          )}
        </div>
      )}

      {/* Block form if user can't upload */}
      {!quotaLoading && uploadQuota && !uploadQuota.canUpload ? (
        <div className="card text-center py-12">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-xl font-bold mb-2">Upload Limit Reached</h2>
          <p className="text-gray-400 mb-6">
            You've used all your free uploads. Upgrade your plan to continue uploading.
          </p>
          <button
            onClick={() => router.push('/pricing')}
            className="btn-primary"
          >
            View Plans
          </button>
        </div>
      ) : (
      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Media Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Media Type *
            </label>
            <div className="grid grid-cols-3 gap-3">
              {['IMAGE', 'VIDEO'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, type }))}
                  className={`p-4 rounded-xl border transition-all ${
                    formData.type === type
                      ? 'border-tank-accent bg-tank-accent/10'
                      : 'border-tank-light hover:border-gray-600'
                  }`}
                >
                  <div className="text-2xl mb-2">
                    {type === 'IMAGE' ? '🖼️' : type === 'VIDEO' ? '🎬' : '🎵'}
                  </div>
                  <div className="font-medium">{type}</div>
                </button>
              ))}
            </div>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              File *
            </label>
            <label
              htmlFor="file-input"
              className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                file
                  ? 'border-tank-accent bg-tank-accent/5'
                  : 'border-tank-light hover:border-gray-600'
              }`}
            >
              {preview ? (
                <div className="space-y-4">
                  {formData.type === 'IMAGE' && (
                    <img
                      src={preview}
                      alt="Preview"
                      className="max-h-64 mx-auto rounded-lg"
                    />
                  )}
                  {formData.type === 'VIDEO' && (
                    <video
                      src={preview}
                      controls
                      playsInline
                      muted
                      preload="metadata"
                      className="max-h-64 mx-auto rounded-lg"
                      onLoadedMetadata={(e) => {
                        // Show first frame on mobile
                        const video = e.currentTarget
                        video.currentTime = 0.1
                      }}
                    />
                  )}
                  <p className="text-sm text-gray-400">{file?.name}</p>
                </div>
              ) : (
                <>
                  <div className="text-4xl mb-4">📁</div>
                  <p className="text-gray-400">
                    Click to select or drag and drop your file
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    {formData.type === 'VIDEO' && 'MP4, WebM, MOV'}
                    {formData.type === 'IMAGE' && 'JPG, PNG, GIF, WebP'}
                  </p>
                </>
              )}
            </label>
            <input
              id="file-input"
              type="file"
              accept={
                formData.type === 'VIDEO'
                  ? 'video/*'
                  : formData.type === 'IMAGE'
                  ? 'image/*'
                  : 'audio/*'
              }
              onChange={(e) => {
                handleFileChange(e)
                // Reset input value to allow re-selecting the same file
                e.target.value = ''
              }}
              onClick={(e) => {
                // Clear value before opening picker (iOS fix)
                (e.target as HTMLInputElement).value = ''
              }}
              className="hidden"
            />
          </div>

          {showCropper && cropSource && cropMediaType && portalMounted && createPortal(
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[99999] p-2 sm:p-4 overscroll-contain touch-none overflow-y-auto">
              <div className="bg-tank-dark border border-tank-light rounded-2xl w-full max-w-2xl p-4 sm:p-6 my-auto max-h-[95vh] overflow-y-auto">
                <div className="relative flex items-center mb-2 sm:mb-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-white pr-12">
                    Crop {cropMediaType === 'video' ? 'Video' : 'Image'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowCropper(false)}
                    className="absolute right-0 top-0 w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 transition-colors flex items-center justify-center"
                    aria-label="Close crop tool"
                    title="Close"
                  >
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div
                  ref={cropContainerRef}
                  className="relative w-full h-[180px] sm:h-[280px] md:h-[360px] bg-black rounded-xl overflow-hidden"
                >
                  <img
                    src={cropSource}
                    alt="Crop preview"
                    className="w-full h-full object-contain select-none"
                    draggable={false}
                    onLoad={(e) => {
                      const img = e.currentTarget
                      const container = cropContainerRef.current?.getBoundingClientRect()
                      if (!container) return

                      const naturalWidth = img.naturalWidth
                      const naturalHeight = img.naturalHeight
                      if (!naturalWidth || !naturalHeight) return

                      const scale = Math.min(container.width / naturalWidth, container.height / naturalHeight)
                      const width = naturalWidth * scale
                      const height = naturalHeight * scale
                      const offsetX = (container.width - width) / 2
                      const offsetY = (container.height - height) / 2

                      setMediaSize({ width: naturalWidth, height: naturalHeight })
                      setRenderBox({
                        containerWidth: container.width,
                        containerHeight: container.height,
                        width,
                        height,
                        offsetX,
                        offsetY,
                      })
                    }}
                  />

                  {cropAreaPixels && mediaSize && renderBox && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{ zIndex: 5 }}
                    >
                      {(() => {
                        const scaleX = renderBox.width / mediaSize.width
                        const scaleY = renderBox.height / mediaSize.height
                        const left = renderBox.offsetX + cropAreaPixels.x * scaleX
                        const top = renderBox.offsetY + cropAreaPixels.y * scaleY
                        const width = cropAreaPixels.width * scaleX
                        const height = cropAreaPixels.height * scaleY
                        return (
                          <div
                            style={{
                              position: 'absolute',
                              left,
                              top,
                              width,
                              height,
                              border: '2px solid rgba(0, 255, 136, 0.95)',
                              boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                              borderRadius: '6px',
                            }}
                          />
                        )
                      })()}
                    </div>
                  )}
                </div>
                {mediaSize && (
                  <div className="grid grid-cols-1 gap-1.5 sm:gap-2 mt-3 sm:mt-4 text-sm text-gray-300">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className="w-14 sm:w-16 shrink-0 text-xs sm:text-sm">Top</span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, mediaSize.height - minCropSize - cropInsets.bottom)}
                        value={cropInsets.top}
                        onChange={(e) => {
                          const nextTop = Number(e.target.value)
                          setCropInsets((prev) => ({
                            ...prev,
                            top: Math.min(
                              Math.max(0, nextTop),
                              Math.max(0, mediaSize.height - minCropSize - prev.bottom)
                            ),
                          }))
                        }}
                        className="flex-1"
                      />
                      <input
                        type="number"
                        min={0}
                        max={Math.max(0, mediaSize.height - minCropSize - cropInsets.bottom)}
                        value={cropInsets.top}
                        onChange={(e) => {
                          const nextTop = Number(e.target.value) || 0
                          setCropInsets((prev) => ({
                            ...prev,
                            top: Math.min(
                              Math.max(0, nextTop),
                              Math.max(0, mediaSize.height - minCropSize - prev.bottom)
                            ),
                          }))
                        }}
                        className="w-20 sm:w-28 pl-2 pr-8 sm:pr-10 py-1 bg-gray-800 border border-gray-600 rounded text-right text-white text-xs sm:text-sm"
                      />
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className="w-14 sm:w-16 shrink-0 text-xs sm:text-sm">Bottom</span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, mediaSize.height - minCropSize - cropInsets.top)}
                        value={cropInsets.bottom}
                        onChange={(e) => {
                          const nextBottom = Number(e.target.value)
                          setCropInsets((prev) => ({
                            ...prev,
                            bottom: Math.min(
                              Math.max(0, nextBottom),
                              Math.max(0, mediaSize.height - minCropSize - prev.top)
                            ),
                          }))
                        }}
                        className="flex-1"
                      />
                      <input
                        type="number"
                        min={0}
                        max={Math.max(0, mediaSize.height - minCropSize - cropInsets.top)}
                        value={cropInsets.bottom}
                        onChange={(e) => {
                          const nextBottom = Number(e.target.value) || 0
                          setCropInsets((prev) => ({
                            ...prev,
                            bottom: Math.min(
                              Math.max(0, nextBottom),
                              Math.max(0, mediaSize.height - minCropSize - prev.top)
                            ),
                          }))
                        }}
                        className="w-20 sm:w-28 pl-2 pr-8 sm:pr-10 py-1 bg-gray-800 border border-gray-600 rounded text-right text-white text-xs sm:text-sm"
                      />
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className="w-14 sm:w-16 shrink-0 text-xs sm:text-sm">Left</span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, mediaSize.width - minCropSize - cropInsets.right)}
                        value={cropInsets.left}
                        onChange={(e) => {
                          const nextLeft = Number(e.target.value)
                          setCropInsets((prev) => ({
                            ...prev,
                            left: Math.min(
                              Math.max(0, nextLeft),
                              Math.max(0, mediaSize.width - minCropSize - prev.right)
                            ),
                          }))
                        }}
                        className="flex-1"
                      />
                      <input
                        type="number"
                        min={0}
                        max={Math.max(0, mediaSize.width - minCropSize - cropInsets.right)}
                        value={cropInsets.left}
                        onChange={(e) => {
                          const nextLeft = Number(e.target.value) || 0
                          setCropInsets((prev) => ({
                            ...prev,
                            left: Math.min(
                              Math.max(0, nextLeft),
                              Math.max(0, mediaSize.width - minCropSize - prev.right)
                            ),
                          }))
                        }}
                        className="w-20 sm:w-28 pl-2 pr-8 sm:pr-10 py-1 bg-gray-800 border border-gray-600 rounded text-right text-white text-xs sm:text-sm"
                      />
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className="w-14 sm:w-16 shrink-0 text-xs sm:text-sm">Right</span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, mediaSize.width - minCropSize - cropInsets.left)}
                        value={cropInsets.right}
                        onChange={(e) => {
                          const nextRight = Number(e.target.value)
                          setCropInsets((prev) => ({
                            ...prev,
                            right: Math.min(
                              Math.max(0, nextRight),
                              Math.max(0, mediaSize.width - minCropSize - prev.left)
                            ),
                          }))
                        }}
                        className="flex-1"
                      />
                      <input
                        type="number"
                        min={0}
                        max={Math.max(0, mediaSize.width - minCropSize - cropInsets.left)}
                        value={cropInsets.right}
                        onChange={(e) => {
                          const nextRight = Number(e.target.value) || 0
                          setCropInsets((prev) => ({
                            ...prev,
                            right: Math.min(
                              Math.max(0, nextRight),
                              Math.max(0, mediaSize.width - minCropSize - prev.left)
                            ),
                          }))
                        }}
                        className="w-20 sm:w-28 pl-2 pr-8 sm:pr-10 py-1 bg-gray-800 border border-gray-600 rounded text-right text-white text-xs sm:text-sm"
                      />
                    </div>
                  </div>
                )}
                {cropMediaType === 'video' && (
                  <p className="text-xs text-gray-400 mt-2">
                    Upload Edit applies this crop to the uploaded video (re-encoded) and thumbnail.
                  </p>
                )}
                <div className="flex flex-col sm:flex-row gap-3 justify-end mt-6">
                  <button
                    type="button"
                    onClick={handleUseOriginal}
                    className="px-6 py-2 bg-tank-gray border border-tank-light text-white rounded-xl hover:bg-tank-light transition-all"
                  >
                    Upload Original
                  </button>
                  <button
                    type="button"
                    onClick={handleUseEdited}
                    className="px-6 py-2 bg-tank-accent text-black font-semibold rounded-xl hover:bg-tank-accent/90 transition-all"
                  >
                    Upload Edit
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Thumbnail (for video/music) */}
          {formData.type === 'VIDEO' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Thumbnail {thumbnail ? '✓' : '(optional)'}
              </label>
              {thumbnail && (
                <div className="mb-2 flex items-center gap-2">
                  <img 
                    src={URL.createObjectURL(thumbnail)} 
                    alt="Thumbnail preview" 
                    className="h-20 rounded-lg object-cover"
                  />
                  <span className="text-xs text-gray-400">
                    {formData.type === 'VIDEO' ? 'Auto-generated from video' : 'Selected'}
                  </span>
                </div>
              )}
              <input
                id="thumbnail-input"
                type="file"
                accept="image/*"
                onChange={(e) => setThumbnail(e.target.files?.[0] || null)}
                className="text-sm"
                aria-label="Upload a thumbnail image"
              />
              <p className="text-xs text-gray-500 mt-1">
                {formData.type === 'VIDEO' 
                  ? 'Thumbnail will be auto-generated from video if not provided' 
                  : 'Upload a cover image for your music'}
              </p>
            </div>
          )}

          {/* Title */}
          <div>
            <label htmlFor="upload-title" className="block text-sm font-medium text-gray-300 mb-2">
              Title *
            </label>
            <input
              type="text"
              id="upload-title"
              name="title"
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="Give your creation a title"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="upload-description" className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              ref={descriptionRef}
              id="upload-description"
              name="description"
              value={formData.description}
              onChange={(e) => {
                const value = e.target.value.slice(0, 500)
                setFormData((prev) => ({ ...prev, description: value }))
              }}
              placeholder="Decribe your created media ..."
              maxLength={500}
              rows={3}
              className="resize-none overflow-hidden"
            />
          </div>

          {/* Price */}
          <div>
            <label htmlFor="upload-price" className="block text-sm font-medium text-gray-300 mb-2">
              Price (USD) - Leave empty for free
            </label>
            <input
              type="number"
              id="upload-price"
              name="price"
              step="0.01"
              min="0.5"
              value={formData.price}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, price: e.target.value }))
              }
              placeholder="e.g., 0.5 or higher (leave empty for free)"
            />
          </div>

          {/* AI Tool */}
          <div>
            <label htmlFor="upload-ai-tool" className="block text-sm font-medium text-gray-300 mb-2">
              AI-generation Tool Used
            </label>
            <input
              type="text"
              id="upload-ai-tool"
              name="aiTool"
              value={formData.aiTool}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, aiTool: e.target.value }))
              }
              placeholder="e.g., Veo, Nano Banana, Runway, Sora, DALL-E, ..."
            />
          </div>

          {/* Real Media Device Used */}
          <div>
            <label htmlFor="upload-real-device" className="block text-sm font-medium text-gray-300 mb-2">
              Real Media Device Used
            </label>
            <input
              type="text"
              id="upload-real-device"
              name="realDevice"
              value={formData.realDevice}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, realDevice: e.target.value }))
              }
              placeholder="e.g., iPhone 17 Pro, Galaxy S25 Ultra, Pixel 10 Pro, Canon EOS R5, Nikon Z6 III, ..."
              className="w-full"
            />
          </div>

          {/* Hashtags */}
          <div>
            <label htmlFor="upload-hashtags" className="block text-sm font-medium text-gray-300 mb-2">
              #Hashtags
            </label>
            <input
              type="text"
              id="upload-hashtags"
              name="hashtags"
              value={formData.hashtags}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, hashtags: e.target.value }))
              }
              placeholder="#AI #art #music #video (separate with spaces)"
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Add hashtags to help others find your content. Start each with # and separate with spaces.
            </p>
          </div>

          {/* Upload Progress */}
          {loading && (
            <div>
              <div className="h-2 bg-tank-light rounded-full overflow-hidden">
                <div
                  className="h-full bg-tank-accent transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-center text-gray-400 mt-2">
                {uploadStatus || `Uploading... ${uploadProgress}%`}
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="w-full sm:w-auto px-6 py-3 bg-tank-gray border border-tank-light text-white rounded-xl hover:bg-tank-light transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !file || !!(uploadQuota && !uploadQuota.canUpload)}
              className="btn-primary w-full"
            >
              {loading ? 'Uploading...' : 
                uploadQuota?.statusType === 'paid' && !uploadPaid && !((uploadQuota?.paidUploadCredits ?? 0) > 0) 
                  ? `Pay & Upload ($${uploadQuota.costPerUpload.toFixed(2)})` 
                  : (uploadQuota?.paidUploadCredits ?? 0) > 0 
                    ? `Upload (Using Paid Credit)` 
                    : 'Upload Media'}
            </button>
          </div>

          <div className="rounded-xl border border-tank-light bg-tank-gray/40 p-4 text-sm text-gray-300">
            <div className="font-semibold text-white mb-1">No Returns on Purchased Media</div>
            <p className="mb-4">
              All digital media purchases are final. Due to the nature of digital assets, returns,
              refunds, cancellations, or exchanges are not permitted once payment has been
              successfully processed.
            </p>
            <div className="font-semibold text-white mb-1">License and Usage Rights</div>
            <p>
              Upon successful upload to aimediatank.com, the media shall be designated as
              license-free between the Seller and the Buyer. The Seller, as the original creator,
              and the Buyer, upon lawful download, are each granted a non-exclusive, perpetual,
              royalty-free license to use, reproduce, display, and distribute the media for both
              personal and commercial purposes.
            </p>
          </div>
        </form>
      </div>
      )}

      {/* Payment Required Modal */}
      {showPaymentModal && uploadQuota && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-tank-dark border border-tank-light rounded-2xl max-w-md w-full p-6">
            <div className="text-center">
              <div className="text-5xl mb-4">💳</div>
              <h3 className="text-xl font-bold mb-2">Payment Required</h3>
              <p className="text-gray-400 mb-6">
                You have used all your free uploads. This upload will cost{' '}
                <span className="text-tank-accent font-bold">${uploadQuota.costPerUpload.toFixed(2)}</span>.
              </p>

              <div className="bg-tank-gray rounded-xl p-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Upload Fee</span>
                  <span className="font-bold">${uploadQuota.costPerUpload.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handlePayForUpload}
                  disabled={paymentLoading}
                  className="w-full py-3 bg-tank-accent text-black font-semibold rounded-xl hover:bg-tank-accent/90 transition-all flex items-center justify-center gap-2"
                >
                  {paymentLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                      Pay ${uploadQuota.costPerUpload.toFixed(2)} & Upload
                    </>
                  )}
                </button>

                <button
                  onClick={() => router.push('/pricing')}
                  className="w-full py-3 bg-tank-gray border border-tank-light text-white rounded-xl hover:bg-tank-light transition-all"
                >
                  Upgrade to Premium (Unlimited Free Uploads)
                </button>

                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="w-full py-3 text-gray-400 hover:text-white transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Paid Success Banner */}
      {uploadPaid && (
        <div className="fixed bottom-4 right-4 bg-tank-accent text-black px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-pulse">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-semibold">Payment successful! You can now upload.</span>
          <button onClick={() => setUploadPaid(false)} className="ml-2 hover:opacity-70">✕</button>
        </div>
      )}
    </div>
  )
}

export default function UploadPage() {
  return (
    <Suspense fallback={
      <div className="max-w-3xl mx-auto p-0 m-0 text-center">
        <div className="animate-pulse">
          <div className="h-10 bg-tank-light rounded w-64 mx-auto mb-4"></div>
          <div className="h-4 bg-tank-light rounded w-96 mx-auto"></div>
        </div>
      </div>
    }>
      <UploadPageContent />
    </Suspense>
  )
}
