'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import MediaPlayer from '@/components/MediaPlayer'

interface MediaDetail {
  id: string
  title: string
  description: string | null
  type: 'VIDEO' | 'IMAGE' | 'MUSIC'
  url: string
  thumbnailUrl: string | null
  aiTool: string | null
  aiPrompt: string | null
  views: number
  avgRating: number
  createdAt: string
  price: number | null
  user: {
    id: string
    username: string
    name: string | null
    avatar: string | null
    bio: string | null
  }
  comments: Array<{
    id: string
    content: string
    createdAt: string
    user: {
      id: string
      username: string
      name: string | null
      avatar: string | null
    }
  }>
  ratings: Array<{
    score: number
    review: string | null
    user: {
      id: string
      username: string
      name: string | null
      avatar: string | null
    }
  }>
  _count: {
    comments: number
    ratings: number
  }
}

export default function MediaPage() {
  const { mediaId } = useParams()
  const { data: session } = useSession()
  const router = useRouter()
  const [media, setMedia] = useState<MediaDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [reactions, setReactions] = useState({ happy: 0, neutral: 0, sad: 0 })
  const [userReaction, setUserReaction] = useState<'happy' | 'neutral' | 'sad' | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [savingMedia, setSavingMedia] = useState(false)
  const [buyingMedia, setBuyingMedia] = useState(false)

  const isOwner = session?.user?.id === media?.user?.id
  const isAdmin = session?.user?.role === 'ADMIN'
  const canManage = isOwner || isAdmin

  useEffect(() => {
    fetchMedia()
    fetchReactions()
    if (session) {
      fetchSavedStatus()
    }
  }, [mediaId, session])

  const fetchSavedStatus = async () => {
    try {
      const res = await fetch(`/api/media/${mediaId}/save`)
      const data = await res.json()
      setIsSaved(data.saved)
    } catch (error) {
      console.error('Error fetching saved status:', error)
    }
  }

  const fetchReactions = async () => {
    try {
      const res = await fetch(`/api/media/${mediaId}/reactions`)
      const data = await res.json()
      if (res.ok) {
        setReactions(data.counts)
        setUserReaction(data.userReaction)
      }
    } catch (error) {
      console.error('Error fetching reactions:', error)
    }
  }

  const handleReaction = async (type: 'happy' | 'neutral' | 'sad') => {
    if (!session) {
      router.push('/login')
      return
    }

    try {
      const res = await fetch(`/api/media/${mediaId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      
      if (res.ok) {
        fetchReactions()
      }
    } catch (error) {
      console.error('Error setting reaction:', error)
    }
  }

  const handleToggleSave = async () => {
    if (!session) {
      router.push('/login')
      return
    }

    setSavingMedia(true)
    try {
      const res = await fetch(`/api/media/${mediaId}/save`, {
        method: isSaved ? 'DELETE' : 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setIsSaved(!isSaved)
      }
    } catch (error) {
      console.error('Error toggling save:', error)
    } finally {
      setSavingMedia(false)
    }
  }

  const handleBuyNow = async () => {
    if (!session) {
      router.push('/login')
      return
    }

    if (!media || !media.price || media.price <= 0) return

    setBuyingMedia(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: media.id }),
      })

      const data = await res.json()

      if (res.ok && data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Failed to start checkout')
      }
    } catch (error) {
      console.error('Error starting checkout:', error)
      alert('Failed to start checkout. Please try again.')
    } finally {
      setBuyingMedia(false)
    }
  }

  const fetchMedia = async () => {
    try {
      const res = await fetch(`/api/media/${mediaId}`)
      const data = await res.json()
      if (res.ok) {
        setMedia(data)
      }
    } catch (error) {
      console.error('Error fetching media:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const handleDelete = async () => {
    if (!media) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/media/${mediaId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        // Redirect back to user's profile (My Contents) instead of home
        const username = session?.user?.username || media.user.username
        router.push(`/profile/${username}`)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete media')
      }
    } catch (error) {
      console.error('Error deleting media:', error)
      alert('Failed to delete media')
    } finally {
      setDeleting(false)
      setShowDeleteModal(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  if (!media) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Media Not Found</h1>
          <p className="text-gray-400 mb-4">This media may have been removed.</p>
          <Link href="/" className="btn-primary">
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Media Player */}
          <MediaPlayer
            type={media.type}
            url={media.url}
            title={media.title}
            thumbnailUrl={media.thumbnailUrl}
          />

          {/* Info */}
          <div className="card">
            <div className="flex items-start justify-between gap-4 mb-2">
              <h1 className="text-2xl font-bold">{media.title}</h1>
              
              {/* Creator Actions */}
              {canManage && (
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/media/${mediaId}/edit`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-tank-gray hover:bg-tank-light rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </Link>
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
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 mb-4">
              <span>{media.views.toLocaleString()} views</span>
              <span>{formatDate(media.createdAt)}</span>
              {media.avgRating > 0 && (
                <span className="flex items-center gap-1 text-yellow-500">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  {media.avgRating} ({media._count.ratings} ratings)
                </span>
              )}
              <span className={`badge ${
                media.type === 'VIDEO' ? 'badge-video' :
                media.type === 'IMAGE' ? 'badge-image' : 'badge-music'
              }`}>
                {media.type}
              </span>
            </div>

            {media.description && (
              <p className="text-gray-300 mb-4">{media.description}</p>
            )}

            {/* Buy Now Button - Only show for paid content that user doesn't own */}
            {media.price && media.price > 0 && !isOwner && (
              <button
                onClick={handleBuyNow}
                disabled={buyingMedia}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 mb-4 rounded-xl font-semibold bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg shadow-green-500/25"
              >
                {buyingMedia ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                )}
                {buyingMedia ? 'Processing...' : `Buy Now - $${media.price.toFixed(2)}`}
              </button>
            )}

            {/* Price Display for Owner */}
            {media.price && media.price > 0 && isOwner && (
              <div className="w-full flex items-center justify-center gap-2 px-4 py-3 mb-4 rounded-xl font-semibold bg-tank-gray border border-tank-light text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Your Price: ${media.price.toFixed(2)}
              </div>
            )}

            {/* Reaction Buttons */}
            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-tank-light">
              <span className="text-sm text-gray-400">Click one you feel</span>
              <div className="flex gap-8">
              <button
                onClick={() => handleReaction('happy')}
                className={`flex flex-col items-center gap-1 transition-transform hover:scale-110 ${userReaction === 'happy' ? 'scale-110' : ''}`}
              >
                <span className={`text-4xl ${userReaction === 'happy' ? 'drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]' : ''}`}>😄</span>
                <span className={`text-sm font-medium ${userReaction === 'happy' ? 'text-yellow-400' : 'text-gray-400'}`}>{reactions.happy}</span>
              </button>
              <button
                onClick={() => handleReaction('neutral')}
                className={`flex flex-col items-center gap-1 transition-transform hover:scale-110 ${userReaction === 'neutral' ? 'scale-110' : ''}`}
              >
                <span className={`text-4xl ${userReaction === 'neutral' ? 'drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]' : ''}`}>😐</span>
                <span className={`text-sm font-medium ${userReaction === 'neutral' ? 'text-yellow-400' : 'text-gray-400'}`}>{reactions.neutral}</span>
              </button>
              <button
                onClick={() => handleReaction('sad')}
                className={`flex flex-col items-center gap-1 transition-transform hover:scale-110 ${userReaction === 'sad' ? 'scale-110' : ''}`}
              >
                <span className={`text-4xl ${userReaction === 'sad' ? 'drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]' : ''}`}>😞</span>
                <span className={`text-sm font-medium ${userReaction === 'sad' ? 'text-yellow-400' : 'text-gray-400'}`}>{reactions.sad}</span>
              </button>
              </div>
            </div>
          </div>

        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Save Button */}
          <button
            onClick={handleToggleSave}
            disabled={savingMedia}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
              isSaved
                ? 'bg-tank-accent text-tank-black hover:bg-tank-accent/90'
                : 'bg-tank-gray border border-tank-light text-white hover:bg-tank-light'
            }`}
          >
            {savingMedia ? (
              <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
            ) : (
              <svg
                className="w-5 h-5"
                fill={isSaved ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
            )}
            {isSaved ? 'Saved to My Contents' : 'Save to My Contents'}
          </button>

          {/* AI Info */}
          {media.aiTool && (
            <div className="bg-tank-dark rounded-xl p-4">
              <span className="text-sm text-gray-500">AI Tool:</span>
              <span className="ml-2 text-tank-accent">{media.aiTool}</span>
            </div>
          )}

          {/* Creator Info */}
          <div className="card">
            <p className="text-gray-400">
              Created by{' '}
              <Link
                href={`/profile/${media.user.username}`}
                className="text-tank-accent hover:underline font-medium"
              >
                {media.user.name || media.user.username}
              </Link>
            </p>
          </div>

        </div>
      </div>

      {/* Delete Confirmation Modal */}
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
              Are you sure you want to delete "<span className="font-semibold">{media.title}</span>"? 
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

