'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface MediaData {
  id: string
  title: string
  description: string | null
  type: 'VIDEO' | 'IMAGE' | 'MUSIC'
  url: string
  thumbnailUrl: string | null
  aiTool: string | null
  aiPrompt: string | null
  price: number | null
  isPublic: boolean
  user: {
    id: string
    username: string
  }
}

export default function EditMediaPage() {
  const { mediaId } = useParams()
  const { data: session, status } = useSession()
  const router = useRouter()
  const [media, setMedia] = useState<MediaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [aiTool, setAiTool] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [price, setPrice] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }
    if (status === 'authenticated') {
      fetchMedia()
    }
  }, [status, mediaId])

  const fetchMedia = async () => {
    try {
      const res = await fetch(`/api/media/${mediaId}`)
      const data = await res.json()
      
      if (!res.ok) {
        setError('Media not found')
        return
      }

      // Check if user is owner or admin
      if (data.user.id !== session?.user?.id && session?.user?.role !== 'ADMIN') {
        router.push(`/media/${mediaId}`)
        return
      }

      setMedia(data)
      setTitle(data.title)
      setDescription(data.description || '')
      setAiTool(data.aiTool || '')
      setAiPrompt(data.aiPrompt || '')
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
      const res = await fetch(`/api/media/${mediaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          aiTool: aiTool.trim() || null,
          aiPrompt: aiPrompt.trim() || null,
          price: price ? parseFloat(price) : null,
          isPublic,
        }),
      })

      if (res.ok) {
        router.push(`/media/${mediaId}`)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to update media')
      }
    } catch (error) {
      console.error('Error updating media:', error)
      setError('Failed to update media')
    } finally {
      setSaving(false)
    }
  }

  if (loading || status === 'loading') {
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
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href={`/media/${mediaId}`}
          className="w-10 h-10 rounded-full bg-tank-gray hover:bg-tank-light flex items-center justify-center transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Edit Media</h1>
          <p className="text-gray-400">Update your content details</p>
        </div>
      </div>

      {/* Preview */}
      <div className="card mb-6">
        <div className="flex items-start gap-4">
          <div className="w-32 h-20 rounded-lg overflow-hidden bg-tank-dark flex-shrink-0">
            {media.type === 'IMAGE' ? (
              <img src={media.url} alt={media.title} className="w-full h-full object-cover" />
            ) : media.thumbnailUrl ? (
              <img src={media.thumbnailUrl} alt={media.title} className="w-full h-full object-cover" />
            ) : media.type === 'VIDEO' ? (
              <video src={media.url} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
            )}
          </div>
          <div className="flex-1">
            <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded mb-2 ${
              media.type === 'VIDEO' ? 'bg-red-500/20 text-red-400' :
              media.type === 'IMAGE' ? 'bg-blue-500/20 text-blue-400' :
              'bg-purple-500/20 text-purple-400'
            }`}>
              {media.type}
            </span>
            <p className="text-sm text-gray-400 truncate">{media.url}</p>
          </div>
        </div>
      </div>

      {/* Edit Form */}
      <form onSubmit={handleSubmit} className="card space-y-6">
        {error && (
          <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Title */}
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

        {/* Description */}
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

        {/* AI Tool */}
        <div>
          <label htmlFor="edit-ai-tool" className="block text-sm font-medium mb-2">AI Tool Used</label>
          <input
            type="text"
            id="edit-ai-tool"
            name="aiTool"
            value={aiTool}
            onChange={(e) => setAiTool(e.target.value)}
            placeholder="e.g., Midjourney, DALL-E, Sora, Suno"
            className="w-full"
          />
        </div>

        {/* AI Prompt */}
        <div>
          <label htmlFor="edit-ai-prompt" className="block text-sm font-medium mb-2">AI Prompt</label>
          <textarea
            id="edit-ai-prompt"
            name="aiPrompt"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Share the prompt you used to generate this..."
            rows={3}
            className="w-full resize-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            Sharing your prompt helps others learn from your creations
          </p>
        </div>

        {/* Price */}
        <div>
          <label className="block text-sm font-medium mb-2">Price (USD)</label>
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
            Leave empty or set to 0 for free content
          </p>
        </div>

        {/* Visibility */}
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

        {/* Actions */}
        <div className="flex gap-4 pt-4 border-t border-tank-light">
          <Link
            href={`/media/${mediaId}`}
            className="btn-secondary flex-1 text-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="btn-primary flex-1"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}


