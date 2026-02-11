'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MediaPlayer from '@/components/MediaPlayer'
import { formatMediaTitle, stripHashtags } from '@/lib/text'
import { stopAllMedia } from '@/lib/mediaStop'

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

export default function MediaPageClient({ mediaId }: { mediaId: string }) {
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
  const [downloading, setDownloading] = useState(false)
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle')

  const isOwner = session?.user?.id === media?.user?.id
  const isAdmin = session?.user?.role === 'ADMIN'
  const canManage = isOwner || isAdmin

  useEffect(() => {
    fetchMedia()
    fetchReactions()
    if (session) {
      fetchSavedStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Get or create visitor ID for anonymous reactions
  const getVisitorId = () => {
    if (typeof window === 'undefined') return null
    let visitorId = localStorage.getItem('visitorId')
    if (!visitorId) {
      visitorId = 'anon_' + Math.random().toString(36).substring(2) + Date.now().toString(36)
      localStorage.setItem('visitorId', visitorId)
    }
    return visitorId
  }

  const fetchReactions = async () => {
    try {
      const visitorId = getVisitorId()
      const headers: HeadersInit = {}
      if (visitorId) {
        headers['x-visitor-id'] = visitorId
      }
      const res = await fetch(`/api/media/${mediaId}/reactions`, { headers })
      const data = await res.json()
      if (res.ok) {
        setReactions(data.counts)
        setUserReaction(data.userReaction)
      }
    } catch (error) {
      console.error('Error fetching reactions:', error)
    }
  }

  const handleReaction = async (type: 'happy' | 'sad') => {
    // Allow reactions without sign-in using visitorId
    const visitorId = getVisitorId()

    try {
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
      await res.json()
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

  const handleDownload = async () => {
    if (!session) {
      router.push('/login')
      return
    }
    setDownloading(true)
    try {
      // Open download in a new tab — the API generates a SAS URL with
      // Content-Disposition: attachment so the browser triggers a file save dialog.
      window.open(`/api/download/${mediaId}`, '_blank')
    } finally {
      // Small delay before resetting so the button doesn't flash
      setTimeout(() => setDownloading(false), 1500)
    }
  }

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/media/${mediaId}`
    const shareTitle = media ? stripHashtags(media.title) : 'Check this out'

    // Use native Web Share API if available (mobile devices)
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, url: shareUrl })
      } catch (e) {
        // User cancelled or share failed — ignore
      }
      return
    }

    // Fallback: copy link to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareStatus('copied')
      setTimeout(() => setShareStatus('idle'), 2000)
    } catch {
      // Clipboard API unavailable — prompt manually
      window.prompt('Copy this link:', shareUrl)
    }
  }

  const fetchMedia = async () => {
    try {
      // Add timestamp to prevent caching and get fresh user data
      const res = await fetch(`/api/media/${mediaId}?t=${Date.now()}`, { cache: 'no-store' })
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
          <Link href="/" className="btn-primary" onClick={() => stopAllMedia()}>
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-[500px]">
      {/* Media Player - Full Width with top padding, content aligned to top */}
      <div className="w-full bg-black pt-5">
        <MediaPlayer
          type={media.type}
          url={media.url}
          title={media.title}
          thumbnailUrl={media.thumbnailUrl}
        />
      </div>

      {/* Content below media */}
      <div className="max-w-4xl mx-auto px-4 pt-5 space-y-6">
        {/* Info Card - Two Column Layout */}
        <div className="card">
          <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
            {/* Left Column: Title, Metadata, Reactions */}
            <div className="min-w-0 lg:flex-1">
              {/* Title Row */}
              <div className="flex items-center gap-2 mb-2 overflow-hidden">
                <h1
                  className="font-semibold text-white truncate min-w-0"
                  title={stripHashtags(media.title)}
                >
                  {formatMediaTitle(media.title, 60)}
                </h1>

                {/* Edit Button - for owners */}
                {canManage && (
                  <Link
                    href={`/media/${mediaId}/edit`}
                    className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-500 rounded-lg transition-colors flex-shrink-0 text-white text-sm font-semibold no-touch-callout"
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    Edit
                  </Link>
                )}
              </div>

              {/* Metadata Row - Diamond, Type, Date, Creator, AI Tool */}
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 mb-4">
                {media.price && media.price > 0 && (
                  <span className="text-pink-500">💎</span>
                )}
                <span
                  className={`badge ${
                    media.type === 'VIDEO'
                      ? 'badge-video'
                      : media.type === 'IMAGE'
                        ? 'badge-image'
                        : 'badge-music'
                  }`}
                >
                  {media.type}
                </span>
                <span>{formatDate(media.createdAt)}</span>
                <span>
                  Created by{' '}
                  <Link href={`/profile/${media.user.username}`} className="text-tank-accent hover:underline font-medium">
                    {media.user.username}
                  </Link>
                </span>
                {media.aiTool && (
                  <span>
                    <span className="text-gray-500">AI Tool:</span>
                    <span className="ml-1 text-tank-accent">{media.aiTool}</span>
                  </span>
                )}
              </div>

              {/* Description Row */}
              {media.description && (
                <p className="text-gray-300 mb-4">{media.description}</p>
              )}

              {/* Views + Reactions Row */}
              <div className="flex items-center gap-6">
                {/* Views */}
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span>{media.views.toLocaleString()} views</span>
                </div>

                {/* Reactions */}
                <button
                  onClick={() => handleReaction('happy')}
                  className={`flex items-center gap-1 transition-transform hover:scale-110 ${
                    userReaction === 'happy' ? 'scale-110' : ''
                  }`}
                >
                  <span
                    className={`text-2xl ${
                      userReaction === 'happy' ? 'drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]' : ''
                    }`}
                  >
                    😄
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      userReaction === 'happy' ? 'text-yellow-400' : 'text-gray-400'
                    }`}
                  >
                    {reactions.happy}
                  </span>
                </button>
                <button
                  onClick={() => handleReaction('sad')}
                  className={`flex items-center gap-1 transition-transform hover:scale-110 ${
                    userReaction === 'sad' ? 'scale-110' : ''
                  }`}
                >
                  <span
                    className={`text-2xl ${
                      userReaction === 'sad' ? 'drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]' : ''
                    }`}
                  >
                    😞
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      userReaction === 'sad' ? 'text-yellow-400' : 'text-gray-400'
                    }`}
                  >
                    {reactions.sad}
                  </span>
                </button>
              </div>
            </div>

            {/* Right Column: Save, Download */}
            <div className="flex flex-col gap-3 lg:items-start">
              {/* Save Button */}
              <button
                onClick={handleToggleSave}
                disabled={savingMedia}
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap ${
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

              {/* Download & Share row */}
              <div className="flex items-center gap-2">
                {/* Download Button — shown for free content (any logged-in user) and owners */}
                {(isOwner || !media.price || media.price === 0) && (
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap bg-tank-gray border border-tank-light text-white hover:bg-tank-light"
                  >
                    {downloading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                    )}
                    {downloading ? 'Preparing...' : 'Download'}
                  </button>
                )}

                {/* Share Button */}
                <button
                  onClick={handleShare}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap bg-tank-gray border border-tank-light text-white hover:bg-tank-light"
                >
                  {shareStatus === 'copied' ? (
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                      />
                    </svg>
                  )}
                  {shareStatus === 'copied' ? 'Copied!' : 'Share'}
                </button>
              </div>
            </div>
          </div>

          {/* Buy Now Button - Only show for paid content that user doesn't own */}
          {media.price && media.price > 0 && !isOwner && (
            <button
              onClick={handleBuyNow}
              disabled={buyingMedia}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 mt-4 rounded-xl font-semibold bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg shadow-green-500/25"
            >
              {buyingMedia ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              )}
              {buyingMedia ? 'Processing...' : `Buy Now - $${media.price.toFixed(2)}`}
            </button>
          )}

          {/* Price Display for Owner */}
          {media.price && media.price > 0 && isOwner && (
            <div className="w-full flex items-center justify-center gap-2 px-4 py-3 mt-4 rounded-xl font-semibold bg-tank-gray border border-tank-light text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Your Price: ${media.price.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold">Delete Media</h3>
                <p className="text-sm text-gray-400">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete "<span className="font-semibold">{stripHashtags(media.title)}</span>"? This will permanently remove the media file and all associated comments and ratings.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="btn-secondary flex-1" disabled={deleting}>
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

      {/* Back Button at bottom left - stop media before navigating so audio does not continue on homepage */}
      <div className="max-w-4xl mx-auto px-4 mt-8">
        <button
          type="button"
          onClick={() => {
            stopAllMedia()
            // Navigate back if there's history, otherwise go home.
            // Do NOT use a timer-based fallback with router.push('/') because
            // Next.js App Router transitions can be slower than the timeout,
            // which fires router.push('/') while router.back() is still in
            // flight — creating a duplicate history entry and requiring two
            // Back clicks to return home.
            if (window.history.length > 1) {
              router.back()
            } else {
              router.replace('/')
            }
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg transition-colors"
        >
          ← Back
        </button>
      </div>
    </div>
  )
}

