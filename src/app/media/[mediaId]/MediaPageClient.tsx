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
  urlHq: string | null
  thumbnailUrl: string | null
  aiTool: string | null
  aiPrompt: string | null
  views: number
  avgRating: number
  createdAt: string
  price: number | null
  processingStatus: string
  processingError?: string | null
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
  const [showShareModal, setShowShareModal] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [mediaDetailDownloadEnabled, setMediaDetailDownloadEnabled] = useState(true)
  const [mediaDetailShareEnabled, setMediaDetailShareEnabled] = useState(true)
  const [mediaDetailSendByEmailEnabled, setMediaDetailSendByEmailEnabled] = useState(true)
  const [retrying, setRetrying] = useState(false)

  const isOwner = session?.user?.id === media?.user?.id
  const isAdmin = session?.user?.role === 'ADMIN'
  const canManage = isOwner || isAdmin

  useEffect(() => {
    const ac = new AbortController()
    const signal = ac.signal
    fetchMedia(signal)
    fetchReactions(signal)
    if (session) {
      fetchSavedStatus(signal)
    }
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId, session])

  // When media is not found (e.g. deleted and user pressed Back), go home so they don't see the error screen
  useEffect(() => {
    if (!loading && !media) {
      router.replace('/')
    }
  }, [loading, media, router])

  useEffect(() => {
    const ac = new AbortController()
    const signal = ac.signal
    const fetchMediaDetailSettings = async () => {
      try {
        const res = await fetch('/api/ui/media-detail', { signal, cache: 'no-store' })
        if (signal.aborted) return
        if (res.ok) {
          const data = await res.json()
          if (signal.aborted) return
          setMediaDetailDownloadEnabled(data.downloadEnabled !== false)
          setMediaDetailShareEnabled(data.shareEnabled !== false)
          setMediaDetailSendByEmailEnabled(data.sendByEmailEnabled !== false)
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        console.error('Error fetching media detail settings:', error)
      }
    }
    fetchMediaDetailSettings()
    const handler = () => fetchMediaDetailSettings()
    window.addEventListener('mediaDetailUpdated', handler as EventListener)
    return () => {
      ac.abort()
      window.removeEventListener('mediaDetailUpdated', handler as EventListener)
    }
  }, [])

  // Poll for processing status when media is still being processed
  useEffect(() => {
    if (!media) return
    if (media.processingStatus === 'completed' || media.processingStatus === 'failed') return

    const ac = new AbortController()
    const signal = ac.signal
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/media/${mediaId}?t=${Date.now()}`, { signal, cache: 'no-store' })
        const data = await res.json()
        if (signal.aborted) return
        if (res.ok) {
          setMedia(data)
          if (data.processingStatus === 'completed' || data.processingStatus === 'failed') {
            clearInterval(interval)
          }
        }
      } catch {
        /* ignore (includes AbortError) */
      }
    }, 5000) // Poll every 5 seconds

    return () => {
      ac.abort()
      clearInterval(interval)
    }
  }, [media?.processingStatus, mediaId])

  const fetchSavedStatus = async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/media/${mediaId}/save`, { signal })
      const data = await res.json()
      if (signal?.aborted) return
      setIsSaved(data.saved)
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
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

  const fetchReactions = async (signal?: AbortSignal) => {
    try {
      const visitorId = getVisitorId()
      const headers: HeadersInit = {}
      if (visitorId) {
        headers['x-visitor-id'] = visitorId
      }
      const res = await fetch(`/api/media/${mediaId}/reactions`, { signal, headers })
      const data = await res.json()
      if (signal?.aborted) return
      if (res.ok) {
        setReactions(data.counts)
        setUserReaction(data.userReaction)
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
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

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/media/${mediaId}` : ''
  const shareTitle = media ? stripHashtags(media.title) : 'Check this out'

  const handleShareClick = () => {
    setShowShareModal(true)
  }

  const handleCopyLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      fetch(`/api/media/${mediaId}/share`, { method: 'POST' }).catch(() => {})
      setShareStatus('copied')
      setTimeout(() => setShareStatus('idle'), 2000)
    } catch {
      window.prompt('Copy this link:', shareUrl)
    }
  }

  const recordShareAction = () => {
    fetch(`/api/media/${mediaId}/share`, { method: 'POST' }).catch(() => {})
  }

  const handleSendByEmail = async () => {
    const to = emailTo.trim()
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      alert('Please enter a valid email address.')
      return
    }
    setSendingEmail(true)
    try {
      const res = await fetch(`/api/media/${mediaId}/share-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message: emailMessage.trim() || undefined }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setShowEmailModal(false)
        setEmailTo('')
        setEmailMessage('')
      } else {
        alert(data.error || 'Failed to send email')
      }
    } catch {
      alert('Failed to send email')
    } finally {
      setSendingEmail(false)
    }
  }

  const fetchMedia = async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/media/${mediaId}?t=${Date.now()}`, { signal, cache: 'no-store' })
      const data = await res.json()
      if (signal?.aborted) return
      if (res.ok) {
        setMedia(data)
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      console.error('Error fetching media:', error)
    } finally {
      if (!signal?.aborted) setLoading(false)
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
        // Go to profile and replace history so Back doesn't return to the deleted media page
        const username = session?.user?.username || media.user.username
        router.replace(`/profile/${username}`)
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

  // Use same player-area layout and white spinner as MediaPlayer so there is only one loading state (no small green then large white).
  if (loading) {
    return (
      <div className="pb-[500px]">
        <div className="w-full bg-black pt-5">
          <div className="flex items-center justify-center w-full max-w-2xl mx-auto aspect-video bg-black">
            <div className="w-16 h-16 relative">
              <svg className="animate-spin w-full h-full" viewBox="0 0 50 50">
                <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
                <circle cx="25" cy="25" r="20" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeDasharray="80, 200" strokeDashoffset="0" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!media) {
    // Redirect to home is handled in useEffect above; show minimal fallback while redirecting
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">Media not found. Redirecting home…</p>
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
        {media.processingStatus === 'pending' || media.processingStatus === 'processing' ? (
          <div className="flex justify-center px-4">
            <div className="relative w-full max-w-2xl aspect-video bg-black overflow-hidden rounded-xl border border-tank-light">
              {/* Processing thumbnail: uploader can check status here; hidden from homepage until completed */}
              {media.thumbnailUrl ? (
                <img
                  src={media.thumbnailUrl}
                  alt={media.title}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-red-900/50 to-orange-900/50 flex items-center justify-center">
                  <div className="text-white/30">
                    <svg className="w-20 h-20" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
                <div className="w-12 h-12 border-2 border-tank-accent/30 border-t-tank-accent rounded-full animate-spin mb-3" />
                <p className="text-white font-semibold mb-1">Processing...</p>
                <p className="text-gray-300 text-sm max-w-md text-center px-4 mb-2">
                  Your media is being transcoded for streaming. This usually takes 1–5 minutes. The page will update automatically when ready.
                </p>
                {isOwner && (
                  <p className="text-tank-accent/90 text-xs">
                    Only you can see this page until processing completes. It won’t appear on the homepage until then.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : media.processingStatus === 'failed' ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <svg className="w-12 h-12 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="text-lg font-semibold text-red-400 mb-2">Processing Failed</h3>
            <p className="text-gray-400 text-sm max-w-md mb-2">
              There was an error processing this video. You can retry or re-upload.
            </p>
            {media.processingError && (
              <p className="text-gray-500 text-xs max-w-lg font-mono break-all mb-4" title={media.processingError}>
                {media.processingError}
              </p>
            )}
            {canManage && (
              <button
                type="button"
                onClick={async () => {
                  if (retrying) return
                  setRetrying(true)
                  try {
                    const res = await fetch(`/api/media/${mediaId}/retry-processing`, { method: 'POST' })
                    const data = await res.json()
                    if (!res.ok) {
                      alert(data.error || 'Retry failed')
                      return
                    }
                    const r = await fetch(`/api/media/${mediaId}?t=${Date.now()}`, { cache: 'no-store' })
                    if (r.ok) {
                      const updated = await r.json()
                      setMedia(updated)
                    }
                  } catch (e) {
                    console.error('Retry failed:', e)
                    alert('Retry failed. Please try again.')
                  } finally {
                    setRetrying(false)
                  }
                }}
                disabled={retrying}
                className="px-4 py-2 bg-tank-accent hover:bg-tank-accent/90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {retrying ? 'Retrying…' : 'Retry processing'}
              </button>
            )}
          </div>
        ) : (
          <div className="no-touch-callout" onContextMenu={(e) => e.preventDefault()}>
            <MediaPlayer
              type={media.type}
              url={(media as any).streamUrl ?? media.url}
              title={media.title}
              thumbnailUrl={media.thumbnailUrl}
              autoUnmuteOnMount
            />
          </div>
        )}
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
              <div className="flex items-center gap-2 flex-wrap">
                {/* Download Button — shown for free content (any logged-in user) and owners, when enabled */}
                {mediaDetailDownloadEnabled && (isOwner || !media.price || media.price === 0) && (
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

                {/* Share Button — when enabled */}
                {mediaDetailShareEnabled && (
                  <>
                    <button
                      onClick={handleShareClick}
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
                    {mediaDetailSendByEmailEnabled && (
                      <button
                        type="button"
                        onClick={() => setShowEmailModal(true)}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap bg-tank-gray border border-tank-light text-white hover:bg-tank-light"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Send by email
                      </button>
                    )}
                  </>
                )}
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

      {/* Share modal — YouTube-style: link, Copy, and curated share options only */}
      {showShareModal && media && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowShareModal(false)}>
          <div className="card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Share</h3>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="text-gray-400 hover:text-white transition-colors p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-gray-300 text-sm truncate mb-1" title={shareTitle}>{shareTitle}</p>
            <div className="flex items-center gap-2 mb-5">
              <p className="flex-1 min-w-0 text-gray-500 text-xs truncate font-mono" title={shareUrl}>{shareUrl}</p>
              <button
                type="button"
                onClick={handleCopyLink}
                className="shrink-0 w-10 h-10 rounded-lg bg-tank-accent text-tank-black hover:opacity-90 transition-opacity flex items-center justify-center"
                title={shareStatus === 'copied' ? 'Copied!' : 'Copy'}
              >
                {shareStatus === 'copied' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {/* Email — opens default mail client with thumbnail URL + media link in body (mailto is plain text only) */}
              <a
                href={`mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(
                  media?.thumbnailUrl ? `${shareTitle}\n\n${media.thumbnailUrl}\n\n${shareUrl}` : shareUrl
                )}`}
                onClick={() => { recordShareAction(); setShowShareModal(false); }}
                className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors"
                title="Email (opens your email app)"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-xs">Email</span>
              </a>
              {mediaDetailSendByEmailEnabled && (
                <button
                  type="button"
                  onClick={() => { setShowShareModal(false); setShowEmailModal(true); }}
                  className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors"
                  title="Send by email (we send it for you)"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  <span className="text-xs">Send by email</span>
                </button>
              )}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareTitle + ' ' + shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={recordShareAction}
                className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors"
                title="WhatsApp"
              >
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                <span className="text-xs">WhatsApp</span>
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={recordShareAction}
                className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors"
                title="Facebook"
              >
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                <span className="text-xs">Facebook</span>
              </a>
              <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={recordShareAction}
                className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors"
                title="X"
              >
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span className="text-xs">X</span>
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={recordShareAction}
                className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors"
                title="LinkedIn"
              >
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                <span className="text-xs">LinkedIn</span>
              </a>
              <a
                href={`https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareTitle)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={recordShareAction}
                className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors"
                title="Reddit"
              >
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.33-1.01 1.614l-.042.02c.01.163.016.33.016.499 0 2.694-3.13 4.88-7.004 4.88-3.874 0-7.004-2.186-7.004-4.88 0-.169.006-.336.016-.499-1.496-.282-2.016-1.272-2.016-2.02 0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12.054c-.827 0-1.5.673-1.5 1.5s.673 1.5 1.5 1.5 1.5-.673 1.5-1.5-.673-1.5-1.5-1.5zm5.5 0c-.827 0-1.5.673-1.5 1.5s.673 1.5 1.5 1.5 1.5-.673 1.5-1.5-.673-1.5-1.5-1.5zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.963-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
                </svg>
                <span className="text-xs">Reddit</span>
              </a>
              <a
                href="https://www.tiktok.com/"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleCopyLink()}
                className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors"
                title="TikTok (link copied)"
              >
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                </svg>
                <span className="text-xs">TikTok</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Send by email modal — sends HTML email with thumbnail + hyperlink so recipient can click to play */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !sendingEmail && setShowEmailModal(false)}>
          <div className="card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Send by email</h3>
              <button
                type="button"
                onClick={() => !sendingEmail && setShowEmailModal(false)}
                className="text-gray-400 hover:text-white transition-colors p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Thumbnail preview — what recipient will see in the email */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-tank-gray border border-tank-light mb-4">
              {media.thumbnailUrl ? (
                <img
                  src={media.thumbnailUrl}
                  alt={stripHashtags(media.title)}
                  className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-tank-light flex items-center justify-center flex-shrink-0">
                  <svg className="w-8 h-8 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{stripHashtags(media.title)}</p>
                <p className="text-gray-400 text-xs mt-0.5">This thumbnail will be in the email (clickable link)</p>
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Recipient will get an email with a thumbnail linked to this media so they can click to watch.
            </p>
            <label className="block text-sm font-medium text-gray-300 mb-1">To (email)</label>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="friend@example.com"
              className="w-full px-4 py-2 rounded-lg bg-tank-gray border border-tank-light text-white placeholder-gray-500 mb-4"
              disabled={sendingEmail}
            />
            <label className="block text-sm font-medium text-gray-300 mb-1">Message (optional)</label>
            <textarea
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              placeholder="Check this out!"
              rows={2}
              className="w-full px-4 py-2 rounded-lg bg-tank-gray border border-tank-light text-white placeholder-gray-500 mb-4 resize-none"
              disabled={sendingEmail}
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => !sendingEmail && setShowEmailModal(false)}
                className="btn-secondary flex-1"
                disabled={sendingEmail}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendByEmail}
                disabled={sendingEmail}
                className="flex-1 px-4 py-2 bg-tank-accent text-tank-black font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {sendingEmail ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

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

