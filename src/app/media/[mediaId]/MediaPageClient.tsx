'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import MediaPlayer from '@/components/MediaPlayer'

// Return username as-is (trimmed) for display
const formatDisplayUsername = (username?: string | null) => {
  if (!username) return ''
  return username.trim()
}

interface MediaDetail {
  id: string
  title: string
  description: string | null
  type: 'VIDEO' | 'IMAGE' | 'MUSIC'
  url: string
  thumbnailUrl: string | null
  aiTool: string | null
  realDevice?: string | null
  aiPrompt: string | null
  views: number
  avgRating: number
  createdAt: string
  price: number | null
  isSold?: boolean
  soldCount?: number
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

interface MediaPageClientProps {
  mediaId?: string
}

export default function MediaPageClient({ mediaId: mediaIdProp }: MediaPageClientProps) {
  const params = useParams()
  const mediaId = mediaIdProp ?? (params?.mediaId as string | undefined)
  const { data: session } = useSession()
  const router = useRouter()
  const [media, setMedia] = useState<MediaDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [reactions, setReactions] = useState({ happy: 0, sad: 0 })
  const [userReaction, setUserReaction] = useState<'happy' | 'sad' | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [savingMedia, setSavingMedia] = useState(false)
  const [buyingMedia, setBuyingMedia] = useState(false)

  const isOwner = session?.user?.id === media?.user?.id
  const isAdmin = session?.user?.role === 'ADMIN'
  const canManage = isOwner || isAdmin
  // Show 'Free' for null/undefined or zero price, otherwise show the price
  const priceLabel =
    media?.price == null || media.price === 0
      ? 'Free'
      : `$${media.price.toFixed(2)}`
  const soldCount = media?.soldCount ?? (media?.isSold ? 1 : 0)
  const showSoldBadge = soldCount > 0

  useEffect(() => {
    if (!mediaId) return
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
      // Include visitor ID for anonymous users to get their reaction status
      const visitorId = typeof window !== 'undefined' ? localStorage.getItem('visitor_id') : null
      const url = visitorId 
        ? `/api/media/${mediaId}/reactions?visitorId=${encodeURIComponent(visitorId)}`
        : `/api/media/${mediaId}/reactions`
      
      const res = await fetch(url)
      const data = await res.json()
      if (res.ok) {
        setReactions(data.counts)
        setUserReaction(data.userReaction)
      }
    } catch (error) {
      console.error('Error fetching reactions:', error)
    }
  }

  // Get or create visitor ID for anonymous users
  const getVisitorId = () => {
    if (typeof window === 'undefined') return null
    let visitorId = localStorage.getItem('visitor_id')
    if (!visitorId) {
      visitorId = 'anon_' + Math.random().toString(36).substring(2) + Date.now().toString(36)
      localStorage.setItem('visitor_id', visitorId)
    }
    return visitorId
  }

  const handleReaction = async (type: 'happy' | 'sad') => {
    try {
      // Get visitor ID for anonymous users
      const visitorId = !session ? getVisitorId() : null
      
      const res = await fetch(`/api/media/${mediaId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, visitorId }),
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
      // Avoid cache-busting on every view; it hurts mobile performance on slow networks.
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
    <div className="max-w-7xl mx-auto p-0 m-0 pb-[500px]">
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Media Player */}
          <div className="pt-[20px]">
            <MediaPlayer
              type={media.type}
              url={media.url}
              title={media.title}
              thumbnailUrl={media.thumbnailUrl}
            />
          </div>

          {/* Info */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2 overflow-hidden">
              <h1 className="font-semibold text-white truncate min-w-0" title={media.title.replace(/#\w+/g, '').trim()}>{media.title.replace(/#\w+/g, '').trim()}</h1>
              
              {/* Edit Button - for owners */}
              {canManage && (
                  <Link
                    href={`/media/${mediaId}/edit`}
                  className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-500 rounded-lg transition-colors flex-shrink-0 text-white text-sm font-semibold"
                  >
                    Edit
                  </Link>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 mb-4">
              <span>{formatDate(media.createdAt)}</span>
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

            {priceLabel && (
              <div className="flex flex-wrap items-center gap-6 mb-4">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold bg-tank-dark border border-tank-light text-white">
                  {priceLabel}
                </div>
                {showSoldBadge && (
                  <svg className="w-6 h-6 text-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.9)]" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 2l4 4.5 6 1.5-6 9.5-4 4.5-4-4.5-6-9.5 6-1.5L12 2z"
                      fill="currentColor"
                    />
                  </svg>
                )}
                <div className="flex items-center gap-6">
                  <span className="text-sm text-gray-400">{media.views.toLocaleString()} views</span>
                  <button
                    onClick={() => handleReaction('happy')}
                    className={`flex items-center gap-1.5 transition-transform hover:scale-105 ${userReaction === 'happy' ? 'scale-105' : ''}`}
                  >
                    <span className={`text-2xl ${userReaction === 'happy' ? 'drop-shadow-[0_0_6px_rgba(234,179,8,0.8)]' : ''}`}>😄</span>
                    <span className={`text-sm font-medium ${userReaction === 'happy' ? 'text-yellow-400' : 'text-gray-400'}`}>{reactions.happy}</span>
                  </button>
                  <button
                    onClick={() => handleReaction('sad')}
                    className={`flex items-center gap-1.5 transition-transform hover:scale-105 ${userReaction === 'sad' ? 'scale-105' : ''}`}
                  >
                    <span className={`text-2xl ${userReaction === 'sad' ? 'drop-shadow-[0_0_6px_rgba(234,179,8,0.8)]' : ''}`}>😞</span>
                    <span className={`text-sm font-medium ${userReaction === 'sad' ? 'text-yellow-400' : 'text-gray-400'}`}>{reactions.sad}</span>
                  </button>
                </div>
              </div>
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
          </div>

        </div>

        {/* Sidebar */}
        <div className="space-y-6 pt-[20px]">
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

          {/* Creator & AI Info */}
          <div className="card space-y-2">
            <p className="text-gray-400">
              Created by{' '}
            <Link
              href={`/profile/${media.user.username}`}
                className="text-tank-accent hover:underline font-medium"
              >
                {formatDisplayUsername(media.user.username)}
              </Link>
            </p>
            {media.aiTool && (
              <p className="text-gray-400">
                <span className="text-gray-500">AI-generation Tool:</span>
                <span className="ml-2 text-tank-accent">{media.aiTool}</span>
              </p>
            )}
            {media.realDevice && (
              <p className="text-gray-400">
                <span className="text-gray-500">Real Media Device:</span>
                <span className="ml-2 text-tank-accent">{media.realDevice}</span>
              </p>
            )}
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

      {/* Back Button at bottom left */}
      <div className="flex justify-start mt-8">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg transition-colors"
        >
          ← Back
        </button>
      </div>
    </div>
  )
}
