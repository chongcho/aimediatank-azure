'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAdminContentElevation } from '@/hooks/useAdminContentElevation'
import { isAppAdminRole } from '@/lib/adminFreshStep2'

interface MediaData {
  id: string
  title: string
  description: string | null
  type: 'VIDEO' | 'IMAGE' | 'MUSIC'
  url: string
  thumbnailUrl: string | null
  aiTool: string | null
  realDevice: string | null
  aiPrompt: string | null
  price: number | null
  isPublic: boolean
  user: {
    id: string
    username: string
  }
}

export default function EditMediaPageContent({ intercepted = false }: { intercepted?: boolean }) {
  const { mediaId } = useParams()
  const { data: session, status } = useSession()
  const { loaded: adminElevLoaded, contentElevated: adminContentElevated } = useAdminContentElevation()
  const router = useRouter()
  const [media, setMedia] = useState<MediaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [aiTool, setAiTool] = useState('')
  const [realDevice, setRealDevice] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [price, setPrice] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const mediaPath = `/media/${mediaId}`

  const returnToDetail = () => {
    if (intercepted) {
      router.back()
    } else {
      window.location.href = mediaPath
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }
    if (status !== 'authenticated') return
    if (isAppAdminRole(session?.user?.role) && !adminElevLoaded) return
    void fetchMedia()
  }, [status, mediaId, session?.user?.role, session?.user?.id, adminElevLoaded, adminContentElevated])

  const fetchMedia = async () => {
    try {
      const res = await fetch(`/api/media/${mediaId}`)
      const data = await res.json()

      if (!res.ok) {
        setError('Media not found')
        return
      }

      const isOwner = data.user.id === session?.user?.id
      const adminRole = isAppAdminRole(session?.user?.role)
      if (!isOwner && !(adminRole && adminContentElevated)) {
        returnToDetail()
        return
      }

      setMedia(data)
      const hashtagMatch = data.title.match(/(#\w+\s*)+$/)
      if (hashtagMatch) {
        const extractedHashtags = hashtagMatch[0].trim()
        const cleanTitle = data.title.replace(extractedHashtags, '').trim()
        setTitle(cleanTitle)
        setHashtags(extractedHashtags)
      } else {
        setTitle(data.title)
        setHashtags('')
      }
      setDescription(data.description || '')
      setAiTool(data.aiTool || '')
      setRealDevice(data.realDevice || '')
      setPrice(data.price ? data.price.toString() : '')
      setIsPublic(data.isPublic)
    } catch (error) {
      console.error('Error fetching media:', error)
      setError('Failed to load media')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required')
      return
    }

    setSaving(true)
    setError('')

    try {
      const fullTitle = hashtags.trim() ? `${title.trim()} ${hashtags.trim()}` : title.trim()

      const res = await fetch(`/api/media/${mediaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          title: fullTitle,
          description: description.trim() || null,
          aiTool: aiTool.trim() || null,
          realDevice: realDevice.trim() || null,
          price: price ? parseFloat(price) : null,
          isPublic,
        }),
      })

      if (res.ok) {
        returnToDetail()
        return
      }
      const data = await res.json()
      if (res.status === 403 && data.code === 'ADMIN_CONTENT_ELEVATION_REQUIRED') {
        const next = encodeURIComponent(`/media/${mediaId}/edit`)
        window.location.href = `/login/admin-verify?next=${next}`
        return
      }
      setError(data.error || 'Failed to update media')
    } catch (error) {
      console.error('Error updating media:', error)
      setError('Failed to update media')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!media) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/media/${mediaId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })

      if (res.ok) {
        // After delete, return to Homepage instead of My Contents
        router.push('/')
      } else {
        const data = await res.json()
        if (res.status === 403 && data.code === 'ADMIN_CONTENT_ELEVATION_REQUIRED') {
          const next = encodeURIComponent(`/media/${mediaId}/edit`)
          window.location.href = `/login/admin-verify?next=${next}`
          return
        }
        setError(data.error || 'Failed to delete media')
      }
    } catch (error) {
      console.error('Error deleting media:', error)
      setError('Failed to delete media')
    } finally {
      setDeleting(false)
      setShowDeleteModal(false)
    }
  }

  const awaitingAdminElevProbe =
    status === 'authenticated' && isAppAdminRole(session?.user?.role) && !adminElevLoaded

  if (loading || status === 'loading' || awaitingAdminElevProbe) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  if (error && !media) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Error</h1>
          <p className="text-gray-400 mb-4">{error}</p>
          <Link href="/" className="btn-primary">
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  if (!media) return null

  return (
    <div className="max-w-3xl mx-auto p-0 m-0 pb-[500px]">
      <div className="flex items-center gap-4 mb-4">
        <button
          type="button"
          onClick={returnToDetail}
          className="w-10 h-10 rounded-full bg-tank-gray hover:bg-tank-light flex items-center justify-center transition-colors no-touch-callout"
          onContextMenu={(e) => e.preventDefault()}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold">Edit Media</h1>
        <span className="text-gray-400">— Update your content details</span>
      </div>

      <div className="card mb-3 !py-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-24 h-16 rounded-lg overflow-hidden bg-tank-dark flex-shrink-0">
              {media.type === 'IMAGE' ? (
                <img src={media.url} alt={media.title} className="w-full h-full object-cover" />
              ) : media.thumbnailUrl ? (
                <img src={media.thumbnailUrl} alt={media.title} className="w-full h-full object-cover" />
              ) : media.type === 'VIDEO' ? (
                <video src={media.url} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
              )}
            </div>
            <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${
              media.type === 'VIDEO' ? 'bg-red-500/20 text-red-400' :
              media.type === 'IMAGE' ? 'bg-blue-500/20 text-blue-400' :
              'bg-purple-500/20 text-purple-400'
            }`}>
              {media.type}
            </span>
          </div>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6">
        {error && (
          <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="edit-title" className="block text-sm font-medium mb-2">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            id="edit-title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a title for your media"
            className="w-full"
            required
          />
        </div>

        <div>
          <label htmlFor="edit-description" className="block text-sm font-medium mb-2">Description</label>
          <textarea
            id="edit-description"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your creation..."
            rows={4}
            className="w-full resize-none"
          />
        </div>

        <div>
          <label htmlFor="edit-ai-tool" className="block text-sm font-medium text-gray-300 mb-2">
            AI-generation Tool Used
          </label>
          <input
            type="text"
            id="edit-ai-tool"
            name="aiTool"
            value={aiTool}
            onChange={(e) => setAiTool(e.target.value)}
            placeholder="e.g., Veo, Nano Banana, Runway, Sora, DALL-E, ..."
            className="w-full"
          />
        </div>

        <div>
          <label htmlFor="edit-real-device" className="block text-sm font-medium text-gray-300 mb-2">
            Real Media Device Used
          </label>
          <input
            type="text"
            id="edit-real-device"
            name="realDevice"
            value={realDevice}
            onChange={(e) => setRealDevice(e.target.value)}
            placeholder="e.g., iPhone 17 Pro, Galaxy S25 Ultra, Pixel 10 Pro, Canon EOS R5, Nikon Z6 III, ..."
            className="w-full"
          />
        </div>

        <div>
          <label htmlFor="edit-hashtags" className="block text-sm font-medium mb-2">#Hashtags</label>
          <input
            type="text"
            id="edit-hashtags"
            name="hashtags"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="#AI #art #music #video (separate with spaces)"
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">
            Add hashtags to help others find your content. Start each with # and separate with spaces.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Download price (USD) — leave empty for free download</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-full pl-8"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Fee for downloading this file. Purchases are final (Terms §10.1). You may change the
            price anytime before purchase (Terms §10.2).
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Visibility</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="visibility"
                checked={isPublic}
                onChange={() => setIsPublic(true)}
                className="w-4 h-4 accent-tank-accent"
              />
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Public
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="visibility"
                checked={!isPublic}
                onChange={() => setIsPublic(false)}
                className="w-4 h-4 accent-tank-accent"
              />
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Private
              </span>
            </label>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Private media is only visible to you
          </p>
        </div>

        <div className="rounded-xl border border-tank-light bg-tank-gray/40 p-4 text-sm text-gray-300">
          <div className="font-semibold text-white mb-1">No Returns</div>
          <p className="mb-4">
            All digital media purchases are final once payment succeeds—no returns, refunds,
            cancellations, or exchanges. See Terms §10.1.
          </p>
          <div className="font-semibold text-white mb-1">License &amp; Usage</div>
          <p>
            Payment does not transfer copyright. Media is license-free between Seller and Buyer
            (non-exclusive, perpetual, royalty-free) for personal/commercial use. Do not re-upload
            identical files. See Terms §§10.7–10.11.
          </p>
        </div>

        <div className="flex gap-4 pt-4 border-t border-tank-light">
          <button
            type="button"
            onClick={returnToDetail}
            className="btn-secondary flex-1 text-center no-touch-callout"
            onContextMenu={(e) => e.preventDefault()}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="btn-primary flex-1"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold">Delete Media</h3>
                <p className="text-sm text-gray-400">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete "<span className="font-semibold">{title || media.title}</span>"?
              This will permanently remove the media file and all associated comments and ratings.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="btn-secondary flex-1"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
