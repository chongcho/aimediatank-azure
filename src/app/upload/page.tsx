'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { compressMedia } from '@/lib/mediaCompression'

interface UploadQuota {
  membershipType: string
  freeUploads: number | string
  freeUploadsUsed: number
  freeUploadsRemaining: number | string
  costPerUpload: number
  nextUploadCost: number
  canUpload: boolean
  statusMessage: string
  statusType: 'free' | 'paid' | 'blocked'
  planDescription: string
}

export default function UploadPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'IMAGE',
    aiTool: '',
    aiPrompt: '',
    price: '',
    isPublic: true,
  })
  const [file, setFile] = useState<File | null>(null)
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadQuota, setUploadQuota] = useState<UploadQuota | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(true)

  // Fetch upload quota on mount
  useEffect(() => {
    if (session?.user) {
      fetchUploadQuota()
    }
  }, [session])

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
    if (selectedFile) {
      setFile(selectedFile)
      
      // Generate preview
      if (selectedFile.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => setPreview(reader.result as string)
        reader.readAsDataURL(selectedFile)
      } else if (selectedFile.type.startsWith('video/')) {
        setPreview(URL.createObjectURL(selectedFile))
        
        // Auto-generate thumbnail from video
        generateVideoThumbnail(selectedFile)
      } else {
        setPreview(null)
      }
    }
  }

  // Generate thumbnail from video file
  const generateVideoThumbnail = async (videoFile: File) => {
    try {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      
      const videoUrl = URL.createObjectURL(videoFile)
      
      video.onloadeddata = () => {
        // Seek to 1 second or 10% of video duration
        video.currentTime = Math.min(1, video.duration * 0.1)
      }
      
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas')
          // Use reasonable thumbnail size
          const maxWidth = 640
          const scale = Math.min(1, maxWidth / video.videoWidth)
          canvas.width = video.videoWidth * scale
          canvas.height = video.videoHeight * scale
          
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  const thumbnailFile = new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' })
                  setThumbnail(thumbnailFile)
                  console.log('Auto-generated video thumbnail')
                }
                URL.revokeObjectURL(videoUrl)
              },
              'image/jpeg',
              0.8
            )
          }
        } catch (err) {
          console.log('Could not generate video thumbnail:', err)
          URL.revokeObjectURL(videoUrl)
        }
      }
      
      video.onerror = () => {
        console.log('Video thumbnail generation failed')
        URL.revokeObjectURL(videoUrl)
      }
      
      video.src = videoUrl
    } catch (err) {
      console.log('Error generating video thumbnail:', err)
    }
  }

  // Upload file to Azure Blob Storage using SAS token
  const uploadToAzure = async (fileToUpload: File, fileType: string): Promise<string> => {
    // Step 1: Get SAS token
    setUploadStatus('Getting upload URL...')
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
      throw new Error(error.error || 'Failed to get upload URL')
    }

    const { uploadUrl, blobUrl } = await sasResponse.json()

    // Step 2: Upload to Azure Blob Storage
    setUploadStatus('Uploading to cloud storage...')
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': fileToUpload.type,
      },
      body: fileToUpload,
    })

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload file to storage')
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

    setLoading(true)
    setUploadProgress(0)

    try {
      // Step 1: Compress the file
      setUploadStatus('Compressing file...')
      setUploadProgress(5)
      
      const compressedFile = await compressMedia(
        file,
        formData.type as 'IMAGE' | 'VIDEO' | 'MUSIC',
        (progress) => {
          // Map compression progress to 5-30%
          setUploadProgress(5 + Math.round(progress * 0.25))
          setUploadStatus(`Compressing... ${progress}%`)
        }
      )
      
      console.log(`Original: ${(file.size / 1024 / 1024).toFixed(2)}MB, Compressed: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`)
      setUploadProgress(30)

      // Step 2: Upload main file to Azure
      const fileUrl = await uploadToAzure(compressedFile, formData.type)
      setUploadProgress(70)

      // Upload thumbnail if provided (compress it too)
      let thumbnailUrl = null
      if (thumbnail) {
        setUploadStatus('Compressing thumbnail...')
        const compressedThumbnail = await compressMedia(thumbnail, 'IMAGE')
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
          title: formData.title,
          description: formData.description,
          type: formData.type,
          url: fileUrl,
          thumbnailUrl,
          aiTool: formData.aiTool,
          aiPrompt: formData.aiPrompt,
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
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Upload AI Media</h1>
        <p className="text-gray-400">
          Share your AI-generated videos, images, or music with the community
        </p>
      </div>

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
              <div className="flex items-center gap-2">
                <div className="text-center px-4 py-2 bg-tank-dark rounded-lg">
                  <p className="text-2xl font-bold text-white">{uploadQuota.freeUploadsUsed}</p>
                  <p className="text-xs text-gray-400">Used</p>
                </div>
                <div className="text-gray-500">/</div>
                <div className="text-center px-4 py-2 bg-tank-dark rounded-lg">
                  <p className="text-2xl font-bold text-tank-accent">{uploadQuota.freeUploads}</p>
                  <p className="text-xs text-gray-400">Free</p>
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
              {['IMAGE', 'VIDEO', 'MUSIC'].map((type) => (
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
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                file
                  ? 'border-tank-accent bg-tank-accent/5'
                  : 'border-tank-light hover:border-gray-600'
              }`}
              onClick={() => document.getElementById('file-input')?.click()}
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
                      className="max-h-64 mx-auto rounded-lg"
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
                    {formData.type === 'MUSIC' && 'MP3, WAV, OGG'}
                  </p>
                </>
              )}
            </div>
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
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Thumbnail (for video/music) */}
          {(formData.type === 'VIDEO' || formData.type === 'MUSIC') && (
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
                type="file"
                accept="image/*"
                onChange={(e) => setThumbnail(e.target.files?.[0] || null)}
                className="text-sm"
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
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Title *
            </label>
            <input
              type="text"
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
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Describe your AI-generated media..."
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Price (USD) - Leave empty for free
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.price}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, price: e.target.value }))
              }
              placeholder="e.g., 9.99 (leave empty for free content)"
            />
          </div>

          {/* AI Tool */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              AI Tool Used
            </label>
            <input
              type="text"
              value={formData.aiTool}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, aiTool: e.target.value }))
              }
              placeholder="e.g., Midjourney, DALL-E, Suno, Runway..."
            />
          </div>

          {/* AI Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              AI Prompt
            </label>
            <textarea
              value={formData.aiPrompt}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, aiPrompt: e.target.value }))
              }
              placeholder="Share the prompt you used to generate this..."
              rows={3}
              className="resize-none"
            />
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

          <button
            type="submit"
            disabled={loading || !file || (uploadQuota && !uploadQuota.canUpload)}
            className="btn-primary w-full"
          >
            {loading ? 'Uploading...' : uploadQuota?.nextUploadCost ? `Upload ($${uploadQuota.nextUploadCost.toFixed(2)})` : 'Upload Media'}
          </button>
        </form>
      </div>
      )}
    </div>
  )
}
