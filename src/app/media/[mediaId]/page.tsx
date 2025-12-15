'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import MediaPlayer from '@/components/MediaPlayer'
import AdSense from '@/components/AdSense'

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
  const [comment, setComment] = useState('')
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState('')
  const [userRating, setUserRating] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showMessageModal, setShowMessageModal] = useState(false)
  const [message, setMessage] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentContent, setEditingCommentContent] = useState('')
  const [isSaved, setIsSaved] = useState(false)
  const [savingMedia, setSavingMedia] = useState(false)
  const [buyingMedia, setBuyingMedia] = useState(false)

  const isOwner = session?.user?.id === media?.user?.id
  const isAdmin = session?.user?.role === 'ADMIN'
  const canManage = isOwner || isAdmin

  useEffect(() => {
    fetchMedia()
    if (session) {
      fetchUserRating()
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

  const fetchUserRating = async () => {
    try {
      const res = await fetch(`/api/media/${mediaId}/rating`)
      const data = await res.json()
      if (data.rating) {
        setUserRating(data.rating.score)
        setRating(data.rating.score)
      }
    } catch (error) {
      console.error('Error fetching user rating:', error)
    }
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim() || !session) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/media/${mediaId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: comment }),
      })

      if (res.ok) {
        setComment('')
        fetchMedia()
      }
    } catch (error) {
      console.error('Error posting comment:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRating = async () => {
    if (!rating || !session) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/media/${mediaId}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: rating, review }),
      })

      if (res.ok) {
        setUserRating(rating)
        fetchMedia()
      }
    } catch (error) {
      console.error('Error rating media:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendMessage = async () => {
    if (!message.trim() || !session || !media) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: media.user.id,
          content: message,
        }),
      })

      if (res.ok) {
        setMessage('')
        setShowMessageModal(false)
        alert('Message sent!')
      }
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setSubmitting(false)
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
        router.push('/')
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

  const handleEditComment = async (commentId: string) => {
    if (!editingCommentContent.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/media/${mediaId}/comments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId, content: editingCommentContent }),
      })

      if (res.ok) {
        setEditingCommentId(null)
        setEditingCommentContent('')
        fetchMedia()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to update comment')
      }
    } catch (error) {
      console.error('Error updating comment:', error)
      alert('Failed to update comment')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Are you sure you want to delete this comment?')) return

    try {
      const res = await fetch(`/api/media/${mediaId}/comments?commentId=${commentId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        fetchMedia()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete comment')
      }
    } catch (error) {
      console.error('Error deleting comment:', error)
      alert('Failed to delete comment')
    }
  }

  const startEditingComment = (commentId: string, content: string) => {
    setEditingCommentId(commentId)
    setEditingCommentContent(content)
  }

  const cancelEditingComment = () => {
    setEditingCommentId(null)
    setEditingCommentContent('')
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

            {/* AI Info */}
            {(media.aiTool || media.aiPrompt) && (
              <div className="bg-tank-dark rounded-xl p-4 space-y-2">
                {media.aiTool && (
                  <div>
                    <span className="text-sm text-gray-500">AI Tool:</span>
                    <span className="ml-2 text-tank-accent">{media.aiTool}</span>
                  </div>
                )}
                {media.aiPrompt && (
                  <div>
                    <span className="text-sm text-gray-500">Prompt:</span>
                    <p className="text-gray-300 mt-1 text-sm bg-tank-gray p-3 rounded-lg">
                      {media.aiPrompt}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rating Section */}
          {session && session.user.id !== media.user.id && (
            <div className="card">
              <h3 className="font-semibold mb-4">Rate this {media.type.toLowerCase()}</h3>
              <div className="flex items-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className="text-2xl transition-transform hover:scale-110"
                  >
                    {star <= rating ? '⭐' : '☆'}
                  </button>
                ))}
                {userRating && (
                  <span className="text-sm text-gray-400 ml-2">
                    (You rated: {userRating})
                  </span>
                )}
              </div>
              <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="Write a review (optional)..."
                rows={2}
                className="mb-4 resize-none"
              />
              <button
                onClick={handleRating}
                disabled={!rating || submitting}
                className="btn-primary"
              >
                {submitting ? 'Submitting...' : userRating ? 'Update Rating' : 'Submit Rating'}
              </button>
            </div>
          )}

          {/* Ad before Comments */}
          <div className="my-6">
            <AdSense
              adSlot="auto"
              adFormat="horizontal"
              className="w-full"
              style={{ minHeight: '90px' }}
            />
          </div>

          {/* Comments */}
          <div className="card">
            <h3 className="font-semibold mb-4">
              Comments ({media._count.comments})
            </h3>

            {session ? (
              <form onSubmit={handleComment} className="mb-6">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment..."
                  rows={3}
                  className="mb-3 resize-none"
                />
                <button
                  type="submit"
                  disabled={!comment.trim() || submitting}
                  className="btn-primary"
                >
                  {submitting ? 'Posting...' : 'Post Comment'}
                </button>
              </form>
            ) : (
              <p className="text-gray-400 mb-6">
                <Link href="/login" className="text-tank-accent hover:underline">
                  Sign in
                </Link>{' '}
                to comment
              </p>
            )}

            <div className="space-y-4">
              {media.comments.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No comments yet</p>
              ) : (
                media.comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-tank-accent to-purple-500 flex-shrink-0 flex items-center justify-center text-sm font-bold">
                      {c.user.name?.[0]?.toUpperCase() || c.user.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/profile/${c.user.username}`}
                            className="font-medium hover:text-tank-accent"
                          >
                            {c.user.name || c.user.username}
                          </Link>
                          <span className="text-sm text-gray-500">
                            {formatDate(c.createdAt)}
                          </span>
                        </div>
                        {/* Edit/Delete buttons for comment owner */}
                        {session?.user?.id === c.user.id && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => startEditingComment(c.id, c.content)}
                              className="p-1.5 text-gray-400 hover:text-tank-accent hover:bg-tank-light rounded transition-colors"
                              title="Edit comment"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteComment(c.id)}
                              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                              title="Delete comment"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                      {/* Editing mode */}
                      {editingCommentId === c.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingCommentContent}
                            onChange={(e) => setEditingCommentContent(e.target.value)}
                            className="w-full resize-none text-sm"
                            rows={2}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditComment(c.id)}
                              disabled={!editingCommentContent.trim() || submitting}
                              className="px-3 py-1 text-sm bg-tank-accent text-tank-black font-semibold rounded-lg hover:bg-tank-accent/90 disabled:opacity-50 transition-colors"
                            >
                              {submitting ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEditingComment}
                              className="px-3 py-1 text-sm bg-tank-gray hover:bg-tank-light rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-300">{c.content}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
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

          {/* Buy Now Button - Only show for paid content that user doesn't own */}
          {media.price && media.price > 0 && !isOwner && (
            <button
              onClick={handleBuyNow}
              disabled={buyingMedia}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg shadow-green-500/25"
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
            <div className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold bg-tank-gray border border-tank-light text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Your Price: ${media.price.toFixed(2)}
            </div>
          )}

          {/* Creator Card */}
          <div className="card">
            <h3 className="font-semibold mb-4">Creator</h3>
            <Link
              href={`/profile/${media.user.username}`}
              className="flex items-center gap-3 mb-4 hover:opacity-80 transition-opacity"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-tank-accent to-purple-500 flex items-center justify-center text-lg font-bold">
                {media.user.name?.[0]?.toUpperCase() || media.user.username[0].toUpperCase()}
              </div>
              <div>
                <div className="font-semibold">{media.user.name || media.user.username}</div>
              </div>
            </Link>
            {media.user.bio && (
              <p className="text-sm text-gray-400 mb-4">{media.user.bio}</p>
            )}
            {session && session.user.id !== media.user.id && (
              <button
                onClick={() => setShowMessageModal(true)}
                className="btn-secondary w-full"
              >
                Send Message
              </button>
            )}
          </div>

          {/* Reviews */}
          {media.ratings.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-4">Reviews</h3>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {media.ratings
                  .filter((r) => r.review)
                  .map((r, i) => (
                    <div key={i} className="border-b border-tank-light pb-4 last:border-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-yellow-500">
                          {'⭐'.repeat(r.score)}
                        </span>
                        <span className="text-sm text-gray-400">
                          by {r.user.name || r.user.username}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300">{r.review}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Message Modal */}
      {showMessageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full">
            <h3 className="text-xl font-semibold mb-4">
              Message @{media.user.username}
            </h3>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your message..."
              rows={4}
              className="mb-4 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowMessageModal(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSendMessage}
                disabled={!message.trim() || submitting}
                className="btn-primary flex-1"
              >
                {submitting ? 'Sending...' : 'Send'}
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

