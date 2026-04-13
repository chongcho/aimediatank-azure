'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatMediaTitle, stripHashtags, truncateText } from '@/lib/text'
import { prefetchMediaPlay } from '@/lib/mediaPlayCache'
import { ThumbsUpIcon } from '@/components/ThumbsUpIcon'

interface MediaCardProps {
  media: {
    id: string
    title: string
    type: string
    url: string
    /** When set (from list API), use for pre-play to match Display streaming max (e.g. 1080p). */
    streamUrl?: string
    thumbnailUrl?: string | null
    /** Shown as bottom overlay on the thumbnail when set (e.g. homepage). */
    description?: string | null
    aiTool?: string | null
    realDevice?: string | null
    price?: number | null
    isSold?: boolean
    soldAt?: string | null
    soldCount?: number
    views: number
    avgRating: number
    createdAt: string
    processingStatus?: string
    reactions?: {
      happy: number
      sad: number
    }
    user: {
      id?: string
      username: string
      name?: string | null
      avatar?: string | null
    }
    _count: {
      comments: number
      ratings: number
    }
    /** Newest first, up to 3 from list API — shown on thumbnail when comment badge is on. */
    comments?: { id: string; content: string; userId?: string }[]
  }
  homeScrollContext?: {
    page: number
    sort: string
    type: string | null
    search: string
  }
  /** When true, VIDEO cards play muted on hover (homepage only, controlled by admin) */
  preplay?: boolean
}

type BadgeItem = { itemKey: string; isEnabled: boolean }

type ModalCommentLine = { id: string; content: string; userId: string }

/** Max height (px) for the comment textarea before it scrolls internally. */
const COMMENT_TEXTAREA_MAX_PX = 200

let badgeItemsCache: BadgeItem[] | null = null
let badgeItemsPromise: Promise<BadgeItem[] | null> | null = null

function resetBadgeItemsCache() {
  badgeItemsCache = null
  badgeItemsPromise = null
}

async function getBadgeItems(): Promise<BadgeItem[] | null> {
  if (badgeItemsCache) return badgeItemsCache
  if (badgeItemsPromise) return badgeItemsPromise

  badgeItemsPromise = (async () => {
    try {
      const res = await fetch('/api/ui/badges', { cache: 'no-store' })
      if (!res.ok) return null
      const data = await res.json()
      const items = (data.items || []) as BadgeItem[]
      badgeItemsCache = items
      return items
    } catch (error) {
      console.error('Error fetching badge settings:', error)
      return null
    } finally {
      badgeItemsPromise = null
    }
  })()

  return badgeItemsPromise
}

export default function MediaCard({ media, homeScrollContext, preplay = false }: MediaCardProps) {
  const router = useRouter()
  const { data: session } = useSession()
  const [commentPortalMounted, setCommentPortalMounted] = useState(false)
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false)
  const [thumbnailError, setThumbnailError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const preplayVideoRef = useRef<HTMLVideoElement>(null)
  const [preplayHover, setPreplayHover] = useState(false)
  const [badgeItems, setBadgeItems] = useState<BadgeItem[] | null>(badgeItemsCache)
  const cardRef = useRef<HTMLDivElement>(null)
  const [isInView, setIsInView] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const preplayViewCountedRef = useRef(false)
  const preplay10sTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefetchInViewRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Local view count so we can update immediately when a preplay view is recorded (no refetch)
  const [displayViews, setDisplayViews] = useState(media.views)
  const [commentModalOpen, setCommentModalOpen] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [modalComments, setModalComments] = useState<ModalCommentLine[]>([])
  const [modalCommentsLoading, setModalCommentsLoading] = useState(false)
  /** Prepends newest comment onto thumbnail preview until list API refetches (home feed). */
  const [optimisticThumbnailComments, setOptimisticThumbnailComments] = useState<ModalCommentLine[]>([])
  const [commentActionId, setCommentActionId] = useState<string | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentDraft, setEditCommentDraft] = useState('')
  const [commentModerating, setCommentModerating] = useState(false)
  const [deleteConfirmCommentId, setDeleteConfirmCommentId] = useState<string | null>(null)
  const commentSubmittingRef = useRef(false)
  const commentModeratingRef = useRef(false)
  const commentDraftTextareaRef = useRef<HTMLTextAreaElement>(null)

  // When processing but 360p/480p (or first variant) is already uploaded, we have a playable stream (used in effects and render)
  const hasPreviewStream =
    media.type === 'VIDEO' &&
    media.processingStatus === 'processing' &&
    !!media.url &&
    /-(?:360p|480p|720p|1080p|hq)\.mp4/i.test(media.url)
  const isPlayable = !media.processingStatus || media.processingStatus === 'completed' || hasPreviewStream

  useEffect(() => {
    setDisplayViews(media.views)
  }, [media.id, media.views])

  useEffect(() => {
    setOptimisticThumbnailComments([])
  }, [media.id])

  useEffect(() => {
    const onBadgeUpdate = () => {
      resetBadgeItemsCache()
      void getBadgeItems().then((items) => setBadgeItems(items))
    }
    window.addEventListener('mediaBadgeSettingsUpdated', onBadgeUpdate)
    return () => window.removeEventListener('mediaBadgeSettingsUpdated', onBadgeUpdate)
  }, [])

  useEffect(() => {
    if (!commentModalOpen || !badgeItems?.length) return
    if (badgeItems.find((b) => b.itemKey === 'comment')?.isEnabled === false) {
      setCommentModalOpen(false)
    }
  }, [commentModalOpen, badgeItems])

  useEffect(() => {
    setCommentPortalMounted(true)
  }, [])

  useEffect(() => {
    commentSubmittingRef.current = commentSubmitting
  }, [commentSubmitting])

  useEffect(() => {
    commentModeratingRef.current = commentModerating
  }, [commentModerating])

  useEffect(() => {
    if (!commentModalOpen) {
      setCommentActionId(null)
      setEditingCommentId(null)
      setEditCommentDraft('')
      setDeleteConfirmCommentId(null)
    }
  }, [commentModalOpen])

  useEffect(() => {
    if (!commentModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (commentSubmittingRef.current || commentModeratingRef.current) return
      if (editingCommentId) {
        setEditingCommentId(null)
        setEditCommentDraft('')
        setCommentActionId(null)
        return
      }
      if (deleteConfirmCommentId) {
        setDeleteConfirmCommentId(null)
        return
      }
      if (commentActionId) {
        setCommentActionId(null)
        return
      }
      setCommentModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commentModalOpen, editingCommentId, commentActionId, deleteConfirmCommentId])

  useEffect(() => {
    if (!commentModalOpen || !media.id) return
    const ac = new AbortController()
    setModalComments([])
    setModalCommentsLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/media/${media.id}?skipView=1`, {
          signal: ac.signal,
          cache: 'no-store',
          credentials: 'same-origin',
        })
        if (res.ok) {
          const data = (await res.json()) as {
            comments?: { id: string; content: string; userId?: string; user?: { id: string } }[]
          }
          const list = (data.comments || []).map((c) => ({
            id: c.id,
            content: c.content,
            userId: c.userId ?? c.user?.id ?? '',
          }))
          if (!ac.signal.aborted) setModalComments(list)
        }
      } catch {
        /* aborted or network */
      } finally {
        if (!ac.signal.aborted) setModalCommentsLoading(false)
      }
    })()
    return () => ac.abort()
  }, [commentModalOpen, media.id])

  useEffect(() => {
    return () => {
      if (preplay10sTimeoutRef.current) {
        clearTimeout(preplay10sTimeoutRef.current)
        preplay10sTimeoutRef.current = null
      }
      if (prefetchInViewRef.current) {
        clearTimeout(prefetchInViewRef.current)
        prefetchInViewRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    setIsMobile(typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches)
  }, [])

  // Only mount video elements when card is in or near viewport to avoid 200+ videos in DOM (performance).
  // Use a tight rootMargin so scrolling doesn't trigger too many concurrent video loads; defer isInView
  // so we only load for cards that stay near viewport (avoids loading for cards that scroll past quickly).
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    let deferId: ReturnType<typeof setTimeout> | null = null
    const observer = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        if (!e) return
        if (e.isIntersecting) {
          if (deferId) clearTimeout(deferId)
          deferId = setTimeout(() => setIsInView(true), 120)
        } else {
          if (deferId) {
            clearTimeout(deferId)
            deferId = null
          }
          setIsInView(false)
        }
      },
      { rootMargin: '60px 0px 100px 0px', threshold: 0 }
    )
    observer.observe(el)
    return () => {
      if (deferId) clearTimeout(deferId)
      observer.disconnect()
    }
  }, [])

  // Prefetch /play when card is in view for a short time (so media page loads instantly on click)
  useEffect(() => {
    if (!isInView || !media.id) return
    if (prefetchInViewRef.current) return
    prefetchInViewRef.current = setTimeout(() => {
      prefetchInViewRef.current = null
      prefetchMediaPlay(media.id)
    }, 400)
    return () => {
      if (prefetchInViewRef.current) {
        clearTimeout(prefetchInViewRef.current)
        prefetchInViewRef.current = null
      }
    }
  }, [isInView, media.id])

  // Mobile: pre-play all cards in extended zone (on-screen + one up/down); no single "focused" card
  useEffect(() => {
    if (!isMobile) return
    const isPreplay = preplay && media.type === 'VIDEO' && isPlayable
    if (!isPreplay) return
    const hasThumb = !!(media.thumbnailUrl || (media.type === 'IMAGE' ? media.url : null))
    const useOverlayVideo = hasThumb && !thumbnailError
    const useFallbackVideo = media.type === 'VIDEO' && !hasThumb && !thumbnailError
    if (isInView) {
      const id = requestAnimationFrame(() => {
        if (useOverlayVideo) preplayVideoRef.current?.play().catch(() => {})
        else if (useFallbackVideo) videoRef.current?.play().catch(() => {})
      })
      return () => cancelAnimationFrame(id)
    } else {
      if (useOverlayVideo) preplayVideoRef.current?.pause()
      else if (useFallbackVideo) videoRef.current?.pause()
    }
  }, [isMobile, isInView, preplay, media.type, isPlayable, media.thumbnailUrl, media.url, thumbnailError])

  useEffect(() => {
    let isMounted = true
    const loadBadges = async () => {
      if (badgeItemsCache) return
      const items = await getBadgeItems()
      if (isMounted) setBadgeItems(items)
    }
    loadBadges()
    return () => {
      isMounted = false
    }
  }, [])

  const isBadgeEnabled = (key: string) => {
    if (!badgeItems || badgeItems.length === 0) return true
    return badgeItems.find((item) => item.itemKey === key)?.isEnabled !== false
  }

  // Remove hashtags and limit to 35 characters for display
  const renderTitle = (title: string) => formatMediaTitle(title, 35)

  const getTypeIcon = () => {
    switch (media.type) {
      case 'VIDEO':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )
      case 'IMAGE':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )
      case 'MUSIC':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        )
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        )
    }
  }

  const getTypeStyle = () => {
    switch (media.type) {
      case 'VIDEO':
        return {
          gradient: 'from-red-500 to-orange-500',
          bg: 'bg-red-500/90',
          shadow: 'shadow-red-500/30',
          text: 'text-orange-400'
        }
      case 'IMAGE':
        return {
          gradient: 'from-blue-500 to-cyan-500',
          bg: 'bg-blue-500/90',
          shadow: 'shadow-blue-500/30',
          text: 'text-blue-400'
        }
      case 'MUSIC':
        return {
          gradient: 'from-purple-500 to-pink-500',
          bg: 'bg-purple-500/90',
          shadow: 'shadow-purple-500/30',
          text: 'text-purple-400'
        }
      default:
        return {
          gradient: 'from-gray-500 to-gray-600',
          bg: 'bg-gray-500/90',
          shadow: 'shadow-gray-500/30',
          text: 'text-gray-400'
        }
    }
  }

  const formatViews = (views: number) => {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K`
    return views.toString()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    return `${days} days ago`
  }

  const typeStyle = getTypeStyle()

  const descriptionOverlay = (() => {
    const raw = media.description?.trim()
    if (!raw) return null
    const cleaned = stripHashtags(raw)
    if (!cleaned) return null
    return { text: truncateText(cleaned, 220), title: cleaned }
  })()

  const showDescriptionThumbnailOverlay =
    Boolean(descriptionOverlay) && isBadgeEnabled('descriptionThumbnails')

  const thumbnailCommentsPreview = useMemo(() => {
    const commentOn =
      !badgeItems?.length || badgeItems.find((b) => b.itemKey === 'comment')?.isEnabled !== false
    if (!commentOn) return []
    const apiRaw = Array.isArray(media.comments) ? media.comments : []
    const api: ModalCommentLine[] = apiRaw.map((c) => ({
      id: c.id,
      content: c.content,
      userId: c.userId ?? '',
    }))
    const seen = new Set<string>()
    const out: ModalCommentLine[] = []
    for (const c of [...optimisticThumbnailComments, ...api]) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      out.push(c)
      if (out.length >= 3) break
    }
    return out
  }, [badgeItems, media.comments, optimisticThumbnailComments])

  // Determine thumbnail source
  const getThumbnailSrc = () => {
    if (media.thumbnailUrl) return media.thumbnailUrl
    if (media.type === 'IMAGE') return media.url
    return null
  }

  const thumbnailSrc = getThumbnailSrc()

  // For videos without thumbnail, we'll show the video element directly
  const showVideoElement = media.type === 'VIDEO' && !thumbnailSrc && !thumbnailError

  const isAiGenerated = Boolean(media.aiTool && media.aiTool.trim())
  const isRealGenerated = Boolean(media.realDevice && media.realDevice.trim())
  const aiLabel = isAiGenerated ? 'AI' : isRealGenerated ? 'Real' : 'Real'

  // Show 'Free' for null/undefined or zero price, otherwise show the price
  const priceLabel =
    media.price == null || media.price === 0 ? 'Free' : `$${media.price.toFixed(2)}`
  const soldCount = media.soldCount ?? (media.isSold ? 1 : 0)
  const showSoldBadge = soldCount > 0

  const navigateToMedia = useCallback(() => {
    if (homeScrollContext) {
      sessionStorage.setItem(
        'homeScrollState',
        JSON.stringify({
          targetId: media.id,
          page: homeScrollContext.page,
          sort: homeScrollContext.sort,
          type: homeScrollContext.type,
          search: homeScrollContext.search,
        })
      )
    }
    router.push(`/media/${media.id}`)
  }, [homeScrollContext, media.id, router])

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-media-card-comment]')) return
    if (e.button !== 0) return
    navigateToMedia()
  }

  const handleCardAuxClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-media-card-comment]')) return
    if (e.button === 1) {
      e.preventDefault()
      window.open(`/media/${media.id}`, '_blank', 'noopener,noreferrer')
    }
  }

  const openCommentModal = (e: React.SyntheticEvent) => {
    if (!isBadgeEnabled('comment')) return
    e.preventDefault()
    e.stopPropagation()
    setCommentError(null)
    setCommentActionId(null)
    setEditingCommentId(null)
    setEditCommentDraft('')
    setCommentModalOpen(true)
  }

  const submitHomeComment = async () => {
    const content = commentDraft.trim()
    if (!content) return
    if (!isBadgeEnabled('comment')) return
    setCommentSubmitting(true)
    setCommentError(null)
    try {
      const res = await fetch(`/api/media/${media.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ content }),
      })
      if (res.status === 401) {
        setCommentError('Sign in to post a comment.')
        return
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setCommentError(data.error || 'Could not post comment.')
        return
      }
      const data = (await res.json()) as {
        comment?: { id: string; content: string; userId?: string }
      }
      if (data.comment?.id) {
        const uid = session?.user?.id ?? ''
        const line: ModalCommentLine = {
          id: data.comment.id,
          content: data.comment.content,
          userId: data.comment.userId ?? uid,
        }
        setOptimisticThumbnailComments((prev) => [line, ...prev])
        setModalComments((prev) => [line, ...prev.filter((p) => p.id !== line.id)])
      }
      setCommentDraft('')
      setCommentModalOpen(false)
    } finally {
      setCommentSubmitting(false)
    }
  }

  const canModerateComment = useCallback(
    (commentAuthorId: string) => {
      const uid = session?.user?.id
      if (!uid) return false
      if (session?.user?.role === 'ADMIN') return true
      if (media.user?.id && uid === media.user.id) return true
      return commentAuthorId !== '' && uid === commentAuthorId
    },
    [session, media.user?.id]
  )

  const saveEditComment = async () => {
    const id = editingCommentId
    const text = editCommentDraft.trim()
    if (!id || !text) return
    setCommentModerating(true)
    setCommentError(null)
    try {
      const res = await fetch(`/api/media/${media.id}/comments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ commentId: id, content: text }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        setCommentError(err.error || 'Could not update comment.')
        return
      }
      const data = (await res.json().catch(() => ({}))) as {
        comment?: { id: string; content: string; userId?: string }
      }
      const savedContent = data.comment?.content ?? text
      const savedUserId =
        data.comment?.userId ??
        modalComments.find((c) => c.id === id)?.userId ??
        session?.user?.id ??
        ''
      setModalComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, content: savedContent, userId: savedUserId || c.userId } : c))
      )
      setOptimisticThumbnailComments((prev) => {
        const line: ModalCommentLine = { id, content: savedContent, userId: savedUserId }
        return [line, ...prev.filter((c) => c.id !== id)]
      })
      setEditingCommentId(null)
      setEditCommentDraft('')
      setCommentActionId(null)
      setCommentModalOpen(false)
    } finally {
      setCommentModerating(false)
    }
  }

  const confirmDeleteHomeComment = async (commentId: string) => {
    setCommentModerating(true)
    setCommentError(null)
    try {
      const res = await fetch(
        `/api/media/${media.id}/comments?commentId=${encodeURIComponent(commentId)}`,
        { method: 'DELETE', credentials: 'same-origin' }
      )
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        setCommentError(err.error || 'Could not delete comment.')
        setDeleteConfirmCommentId(null)
        return
      }
      setDeleteConfirmCommentId(null)
      setModalComments((prev) => prev.filter((c) => c.id !== commentId))
      setOptimisticThumbnailComments((prev) => prev.filter((c) => c.id !== commentId))
      setCommentActionId(null)
      if (editingCommentId === commentId) {
        setEditingCommentId(null)
        setEditCommentDraft('')
      }
    } catch {
      setCommentError('Could not delete comment.')
      setDeleteConfirmCommentId(null)
    } finally {
      setCommentModerating(false)
    }
  }

  const isPreplayVideo = preplay && media.type === 'VIDEO' && isPlayable

  const recordPreplayView = useCallback(() => {
    if (preplayViewCountedRef.current || !media.id) return
    preplayViewCountedRef.current = true
    if (preplay10sTimeoutRef.current) {
      clearTimeout(preplay10sTimeoutRef.current)
      preplay10sTimeoutRef.current = null
    }
    setDisplayViews((prev) => prev + 1)
    fetch(`/api/media/${media.id}/view`, { method: 'POST', credentials: 'same-origin' }).catch(() => {})
  }, [media.id])

  const clearPreplay10sTimeout = useCallback(() => {
    if (preplay10sTimeoutRef.current) {
      clearTimeout(preplay10sTimeoutRef.current)
      preplay10sTimeoutRef.current = null
    }
  }, [])

  const startPreplay10sTimer = useCallback(() => {
    clearPreplay10sTimeout()
    preplay10sTimeoutRef.current = setTimeout(recordPreplayView, 10_000)
  }, [recordPreplayView, clearPreplay10sTimeout])

  const handlePreplayPointerEnter = () => {
    if (!isPreplayVideo) return
    // On mobile, preplay is driven only by isInView; ignore pointer enter/leave so long touch doesn't stop it.
    if (isMobile) return
    setPreplayHover(true)
    if (thumbnailSrc && !thumbnailError) {
      preplayVideoRef.current?.play().catch(() => {})
    } else if (showVideoElement) {
      videoRef.current?.play().catch(() => {})
    }
  }
  const handlePreplayPointerLeave = () => {
    if (!isPreplayVideo) return
    // On mobile, do not pause on pointer leave — long touch often fires pointerleave and was stopping preplay.
    // Mobile preplay is driven only by isInView (scroll in/out).
    if (isMobile) return
    setPreplayHover(false)
    if (thumbnailSrc && !thumbnailError) {
      preplayVideoRef.current?.pause()
    } else if (showVideoElement) {
      videoRef.current?.pause()
    }
  }

  const handleMouseEnter = () => {
    prefetchMediaPlay(media.id)
  }

  const loginCallbackUrl =
    typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/'

  const latestModalComments = modalComments.slice(0, 3)
  const olderModalComments = modalComments.slice(3)

  const editingOriginalContent = editingCommentId
    ? modalComments.find((c) => c.id === editingCommentId)?.content ?? ''
    : ''
  const activeDraft = editingCommentId ? editCommentDraft : commentDraft
  const canSubmitPost =
    !commentSubmitting &&
    !commentModerating &&
    activeDraft.trim().length > 0 &&
    (!editingCommentId || activeDraft.trim() !== editingOriginalContent.trim())

  /** Grow the comment field with content; cap height then scroll inside. */
  useLayoutEffect(() => {
    if (!commentModalOpen || !session?.user) return
    const el = commentDraftTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, COMMENT_TEXTAREA_MAX_PX)}px`
  }, [commentModalOpen, session?.user, activeDraft, editingCommentId])

  const commentTextClass = 'text-sm text-gray-200 whitespace-pre-wrap break-words'

  const renderModalCommentRow = (c: ModalCommentLine) => (
    <div key={c.id} className="py-2 first:pt-0">
      {editingCommentId === c.id ? (
        <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
          <p className={commentTextClass}>{c.content}</p>
          <p className="text-[11px] text-tank-accent/80">Editing… change text below, then press Save to close.</p>
        </div>
      ) : (
        <>
          {canModerateComment(c.userId) ? (
            <button
              type="button"
              className={`${commentTextClass} w-full rounded-md px-1 py-0.5 text-left hover:bg-tank-light/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-tank-accent/50`}
              onClick={(e) => {
                e.stopPropagation()
                setCommentActionId((prev) => (prev === c.id ? null : c.id))
              }}
            >
              {c.content}
            </button>
          ) : (
            <p className={commentTextClass}>{c.content}</p>
          )}
          {commentActionId === c.id && canModerateComment(c.userId) ? (
            <div className="mt-1.5 flex flex-wrap gap-3" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="text-xs font-medium text-tank-accent hover:underline disabled:opacity-50"
                disabled={commentModerating}
                onClick={() => {
                  setEditingCommentId(c.id)
                  setEditCommentDraft(c.content)
                  setCommentDraft('')
                  setCommentActionId(null)
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-xs font-medium text-red-400 hover:underline disabled:opacity-50"
                disabled={commentModerating}
                onClick={() => setDeleteConfirmCommentId(c.id)}
              >
                Delete
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )

  return (
    <>
      <div
        data-media-id={media.id}
        onClick={handleCardClick}
        onAuxClick={handleCardAuxClick}
        onMouseEnter={handleMouseEnter}
        onContextMenu={(e) => e.preventDefault()}
        className="group cursor-pointer block focus:outline-none no-touch-callout [-webkit-tap-highlight-color:transparent]"
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          // Match handleCardClick: do not hijack keyboard activation of the Comment button.
          if ((e.target as HTMLElement).closest('[data-media-card-comment]')) return
          e.preventDefault()
          navigateToMedia()
        }}
        aria-label={`Open ${stripHashtags(media.title)}`}
      >
      <div ref={cardRef} className="media-card-inner bg-tank-gray rounded-md overflow-hidden border border-tank-light transition-all duration-300 [@media(hover:hover)]:hover:border-tank-accent/50 [@media(hover:hover)]:hover:shadow-lg [@media(hover:hover)]:hover:shadow-tank-accent/10">
        {/* Thumbnail — natural aspect ratio for masonry layout */}
        <div
          className="relative bg-tank-dark overflow-hidden outline-none [-webkit-tap-highlight-color:transparent]"
          onPointerEnter={handlePreplayPointerEnter}
          onPointerLeave={handlePreplayPointerLeave}
        >
          {/* Skeleton placeholder while thumbnail loads */}
          {thumbnailSrc && !thumbnailLoaded && !thumbnailError && (
            <div className="aspect-video skeleton" />
          )}

          {isBadgeEnabled('ai') && (
            <div className="absolute top-2 left-2 z-10 px-2 py-1 rounded-md text-[11px] font-bold uppercase bg-black/70 text-white/70 backdrop-blur-sm">
              {aiLabel}
            </div>
          )}

          {/* Price and Sold badges - render independently based on their own settings */}
          {(priceLabel && isBadgeEnabled('price')) || (showSoldBadge && isBadgeEnabled('sold')) ? (
            <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1">
              {priceLabel && isBadgeEnabled('price') && (
                <div className="px-2 py-1 rounded-md text-[11px] font-bold bg-black/70 text-white/70 backdrop-blur-sm">
                  {priceLabel}
                </div>
              )}
              {showSoldBadge && isBadgeEnabled('sold') && (
                <div className="flex justify-end">
                  <svg
                    className="w-3.5 h-3.5 text-red-500/70 drop-shadow-[0_0_3px_rgba(239,68,68,0.63)]"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 2l4 4.5 6 1.5-6 9.5-4 4.5-4-4.5-6-9.5 6-1.5L12 2z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
              )}
            </div>
          ) : null}

          {thumbnailSrc && !thumbnailError ? (
            <>
              <img
                src={thumbnailSrc}
                alt={media.title}
                className={`w-full h-auto block group-hover:scale-105 transition-transform duration-500${thumbnailLoaded ? '' : ' invisible absolute'}`}
                onLoad={() => setThumbnailLoaded(true)}
                onError={() => setThumbnailError(true)}
              />
              {isPreplayVideo && isInView && (
                <video
                  ref={preplayVideoRef}
                  src={media.streamUrl ?? media.url}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 pointer-events-none ${preplayHover || (isMobile && isInView) ? 'opacity-100' : 'opacity-0'}`}
                  muted
                  playsInline
                  preload="metadata"
                  loop
                  onPlay={startPreplay10sTimer}
                  onPause={clearPreplay10sTimeout}
                  onTimeUpdate={(e) => {
                    // loop prevents "ended" from firing; detect one cycle when currentTime nears duration
                    const v = e.currentTarget
                    if (v.duration > 0 && v.currentTime >= v.duration - 0.25) recordPreplayView()
                  }}
                />
              )}
              {/* When Preplay is OFF, still preload metadata so media detail page loads faster when user clicks */}
              {!preplay && media.type === 'VIDEO' && isInView && isPlayable && (
                <video
                  src={media.streamUrl ?? media.url}
                  preload="metadata"
                  className="absolute inset-0 w-full h-full pointer-events-none opacity-0"
                  muted
                  playsInline
                  aria-hidden
                />
              )}
            </>
          ) : showVideoElement && isInView ? (
            // Show video element as fallback for videos only when in view (performance).
            // preload="metadata" required so onLoadedMetadata fires and we can seek to 1s for preview frame.
            <video
              ref={videoRef}
              src={media.streamUrl ?? media.url}
              className="w-full aspect-video object-cover"
              muted
              playsInline
              preload="metadata"
              poster=""
              onLoadedMetadata={(e) => {
                const video = e.currentTarget
                if (video.duration > 1) {
                  video.currentTime = 1
                }
              }}
              onPlay={preplay ? startPreplay10sTimer : undefined}
              onPause={preplay ? clearPreplay10sTimeout : undefined}
              onEnded={preplay ? recordPreplayView : undefined}
              onError={() => setThumbnailError(true)}
            />
          ) : media.type === 'VIDEO' ? (
            // Video gradient placeholder when video fails to load
            <div className={`w-full aspect-video bg-gradient-to-br ${typeStyle.gradient} flex items-center justify-center`}>
              <div className="text-white/70 scale-[3]">
                {getTypeIcon()}
              </div>
            </div>
          ) : (
            // Gradient placeholder for music or failed loads
            <div className={`w-full aspect-video bg-gradient-to-br ${typeStyle.gradient} flex items-center justify-center`}>
              <div className="text-white/70 scale-[3]">
                {getTypeIcon()}
              </div>
            </div>
          )}


          {/* Processing overlay: only when no playable stream yet (pending or processing before 480p ready) */}
          {media.processingStatus && media.processingStatus !== 'completed' && !hasPreviewStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20">
              {media.processingStatus === 'failed' ? (
                <p className="text-red-400/70 text-xs font-medium">Processing failed</p>
              ) : (
                <>
                  <div className="w-8 h-8 border-3 border-tank-accent/30 border-t-tank-accent rounded-full animate-spin mb-2" />
                  <p className="text-white/70 text-xs font-medium">Processing...</p>
                </>
              )}
            </div>
          )}
          {/* Small badge when 480p is playing but HD is still encoding */}
          {!homeScrollContext && hasPreviewStream && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded-full bg-black/70 text-[10px] font-medium flex items-center gap-1.5 z-10">
              <div className="w-2 h-2 border-2 border-tank-accent/50 border-t-white/80 rounded-full animate-spin" />
              <span className="text-white/70">Encoding HD…</span>
            </div>
          )}

          {/* Music wave animation overlay */}
          {media.type === 'MUSIC' && (
            <div className="absolute bottom-3 left-3 right-3 z-[10] flex items-end justify-center gap-1 h-8 pointer-events-none">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-white/60 rounded-full animate-pulse"
                  style={{
                    height: `${20 + Math.random() * 60}%`,
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: '0.8s'
                  }}
                />
              ))}
            </div>
          )}

          {(thumbnailCommentsPreview.length > 0 ||
            (showDescriptionThumbnailOverlay && descriptionOverlay)) && (
            <div className="absolute inset-x-0 bottom-0 z-[11] pointer-events-none flex flex-col justify-end gap-1">
              {thumbnailCommentsPreview.length > 0 && (
                <div className="px-3 pb-0.5 space-y-0.5">
                  {thumbnailCommentsPreview.map((c) => (
                    <p
                      key={c.id}
                      className="text-[13px] text-white/90 leading-snug line-clamp-2 break-words [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]"
                      title={c.content}
                    >
                      {c.content}
                    </p>
                  ))}
                </div>
              )}
              {showDescriptionThumbnailOverlay && descriptionOverlay && (
                <div className="bg-gradient-to-t from-black/90 via-black/55 to-transparent pt-10 pb-2.5 px-3">
                  <p
                    className="text-[14px] text-gray-100/70 leading-snug line-clamp-3 break-words [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
                    title={descriptionOverlay.title}
                  >
                    {descriptionOverlay.text}
                  </p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Content: grid so type + date share one right column (aligned right edges, same gray as date) */}
        <div className="p-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-2 items-start">
          <h3
            className="font-semibold text-white transition-colors truncate min-w-0 col-start-1 row-start-1"
            title={stripHashtags(media.title)}
          >
            {renderTitle(media.title)}
          </h3>
          <div className="col-start-2 row-start-1 justify-self-end flex items-center gap-1 text-xs font-bold text-gray-300 tabular-nums">
            {getTypeIcon()}
            <span className="uppercase">{media.type}</span>
          </div>

          <div
            className={`row-start-2 flex items-center gap-3 text-sm text-gray-300 min-w-0 ${
              isBadgeEnabled('postDate') ? 'col-start-1' : 'col-span-2'
            }`}
          >
            {isBadgeEnabled('views') && (
              <span className="flex items-center gap-1 shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                {formatViews(displayViews)}
              </span>
            )}
            {isBadgeEnabled('smileRate') && (
              <span className="flex items-center gap-1 shrink-0">
                <ThumbsUpIcon className="w-4 h-4 shrink-0 text-gray-400" />
                <span>{media.reactions?.happy ?? 0}</span>
              </span>
            )}
            {isBadgeEnabled('comment') && (
              <button
                type="button"
                data-media-card-comment
                className="flex items-center gap-1 shrink-0 rounded-md text-sm text-gray-300 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-tank-accent/50"
                onClick={(e) => {
                  e.stopPropagation()
                  openCommentModal(e)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    openCommentModal(e)
                  }
                }}
                aria-label="Open comments"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <span>Comment</span>
              </button>
            )}
          </div>

          {isBadgeEnabled('postDate') && (
            <span className="col-start-2 row-start-2 justify-self-end text-sm text-gray-300 whitespace-nowrap tabular-nums">
              {formatDate(media.createdAt)}
            </span>
          )}
        </div>
      </div>
      </div>

      {commentPortalMounted &&
        commentModalOpen &&
        isBadgeEnabled('comment') &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
            role="presentation"
            onClick={() => {
              if (commentSubmitting || commentModerating) return
              if (deleteConfirmCommentId) {
                setDeleteConfirmCommentId(null)
                return
              }
              setCommentModalOpen(false)
            }}
          >
            <div
              className="relative w-full max-w-md rounded-xl border border-tank-light bg-tank-gray p-5 shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="media-card-comment-title"
              onClick={(e) => e.stopPropagation()}
            >
              {deleteConfirmCommentId ? (
                <div
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/55 p-4"
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="media-card-delete-comment-title"
                  aria-describedby="media-card-delete-comment-desc"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-full max-w-sm rounded-lg border border-tank-light bg-tank-gray px-4 py-4 shadow-lg">
                    <h4 id="media-card-delete-comment-title" className="text-base font-semibold text-white">
                      Delete comment?
                    </h4>
                    <p id="media-card-delete-comment-desc" className="mt-2 text-sm text-gray-400">
                      This cannot be undone.
                    </p>
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-tank-light/50 transition-colors"
                        disabled={commentModerating}
                        onClick={() => setDeleteConfirmCommentId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                        disabled={commentModerating}
                        onClick={() => void confirmDeleteHomeComment(deleteConfirmCommentId)}
                      >
                        {commentModerating ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              <h3 id="media-card-comment-title" className="text-lg font-semibold text-white mb-1 truncate pr-8">
                Comment
              </h3>
              {modalCommentsLoading ? (
                <p className="text-xs text-gray-500 mb-3">Loading comments…</p>
              ) : latestModalComments.length > 0 ? (
                <div className="mb-3 flex flex-col divide-y divide-tank-light/25">
                  {latestModalComments.map((c) => renderModalCommentRow(c))}
                </div>
              ) : null}
              <p className="text-sm text-gray-400 mb-3 truncate" title={stripHashtags(media.title)}>
                {stripHashtags(media.title)}
              </p>
              {session?.user ? (
                <>
                  {olderModalComments.length > 0 && (
                    <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-tank-light/40 bg-tank-dark/50 px-3 py-2 flex flex-col divide-y divide-tank-light/25">
                      {olderModalComments.map((c) => renderModalCommentRow(c))}
                    </div>
                  )}
                  <textarea
                    ref={commentDraftTextareaRef}
                    rows={1}
                    value={activeDraft}
                    onChange={(e) => {
                      if (editingCommentId) setEditCommentDraft(e.target.value)
                      else setCommentDraft(e.target.value)
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' || e.shiftKey) return
                      e.preventDefault()
                      if (!canSubmitPost) return
                      if (editingCommentId) void saveEditComment()
                      else void submitHomeComment()
                    }}
                    placeholder={editingCommentId ? 'Edit comment…' : 'Write a comment…'}
                    className="w-full min-h-[2.5rem] max-h-[200px] resize-none overflow-y-auto rounded-lg border border-tank-light bg-tank-dark px-3 py-2 text-sm leading-snug text-white placeholder:text-gray-500 focus:border-tank-accent focus:outline-none focus:ring-1 focus:ring-tank-accent"
                    disabled={commentSubmitting || commentModerating}
                    autoComplete="off"
                  />
                  {commentError && <p className="mt-2 text-sm text-red-400">{commentError}</p>}
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-tank-light/50 transition-colors"
                      onClick={() => {
                        if (editingCommentId) {
                          setEditingCommentId(null)
                          setEditCommentDraft('')
                          return
                        }
                        setCommentModalOpen(false)
                      }}
                      disabled={commentSubmitting || commentModerating}
                    >
                      {editingCommentId ? 'Cancel edit' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg text-sm font-semibold bg-tank-accent text-tank-black hover:opacity-90 disabled:opacity-50"
                      onClick={() => {
                        if (editingCommentId) void saveEditComment()
                        else void submitHomeComment()
                      }}
                      disabled={!canSubmitPost}
                    >
                      {commentSubmitting
                        ? 'Posting…'
                        : commentModerating
                          ? editingCommentId
                            ? 'Saving…'
                            : 'Posting…'
                          : editingCommentId
                            ? 'Save'
                            : 'Post'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  {olderModalComments.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-tank-light/40 bg-tank-dark/50 px-3 py-2 flex flex-col divide-y divide-tank-light/25">
                      {olderModalComments.map((c) => renderModalCommentRow(c))}
                    </div>
                  )}
                  <p className="text-sm text-gray-300">Sign in to add a comment on this media.</p>
                  {commentError && <p className="text-sm text-red-400">{commentError}</p>}
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-tank-light/50 transition-colors"
                      onClick={() => setCommentModalOpen(false)}
                    >
                      Close
                    </button>
                    <Link
                      href={`/login?callbackUrl=${encodeURIComponent(loginCallbackUrl)}`}
                      className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold bg-tank-accent text-tank-black hover:opacity-90"
                    >
                      Sign in
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
