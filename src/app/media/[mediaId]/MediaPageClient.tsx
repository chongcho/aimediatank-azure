'use client'

import { useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MediaPlayer from '@/components/MediaPlayer'
import MediaDownloadingOverlay from '@/components/MediaDownloadingOverlay'
import { formatMediaTitle, stripHashtags } from '@/lib/text'
import { pauseAllMedia, stopAllMedia } from '@/lib/mediaStop'
import { getMediaPlayCache } from '@/lib/mediaPlayCache'
import { mergeStoredMediaViews } from '@/lib/mediaViewsSync'
import { getStoredLikes, publishLikes, subscribeLikes } from '@/lib/mediaLikesSync'
import { calendarLocaleFromUiTag } from '@/lib/localeUi'
import MediaShareModal from '@/components/MediaShareModal'
import CelebrationCardModal from '@/components/CelebrationCardModal'
import { ThumbsUpIcon } from '@/components/ThumbsUpIcon'
import {
  fetchMediaDetailSettings,
  resetMediaDetailSettingsCache,
} from '@/lib/mediaDetailSettingsClient'
import { TranslatedPlaintext } from '@/components/TranslatedPlaintext'
import { useFeedCardTextMode } from '@/contexts/FeedCardTextModeContext'
import { useUiLocale } from '@/hooks/useUiLocale'
import { useAutoTranslationEnabled } from '@/hooks/useAutoTranslationEnabled'
import { useGuestFeedLocalTargets } from '@/hooks/useGuestFeedLocalTargets'
import { useAdminContentElevation } from '@/hooks/useAdminContentElevation'
import { formatMediaViewsLabel, mediaPageInterpolate } from '@/messages/mediaPage'

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

export default function MediaPageClient({ mediaId, intercepted = false }: { mediaId: string; intercepted?: boolean }) {
  const { data: session } = useSession()
  const { localeTag, tMedia } = useUiLocale()
  const autoTranslationEnabled = useAutoTranslationEnabled()
  const { mode: feedCardTextMode } = useFeedCardTextMode()
  const localTranslateEnabled = autoTranslationEnabled && feedCardTextMode === 'local'
  const { mtTag, guestLocal, ensureGuestGeoLoaded } = useGuestFeedLocalTargets(autoTranslationEnabled)
  useEffect(() => {
    if (guestLocal) void ensureGuestGeoLoaded()
  }, [guestLocal, ensureGuestGeoLoaded])
  const router = useRouter()
  const [media, setMedia] = useState<MediaDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [reactions, setReactions] = useState(() => {
    const stored = getStoredLikes(mediaId)
    return { happy: stored?.happy ?? 0, sad: 0 }
  })
  const [userReaction, setUserReaction] = useState<'happy' | 'sad' | 'neutral' | null>(() => {
    const stored = getStoredLikes(mediaId)
    return stored?.liked ? 'happy' : null
  })
  const [likePending, setLikePending] = useState(false)
  const likeInFlightRef = useRef(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [savingMedia, setSavingMedia] = useState(false)
  const [buyingMedia, setBuyingMedia] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle')
  const [showShareModal, setShowShareModal] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailDeliveryMethod, setEmailDeliveryMethod] = useState<'email' | 'phone'>('email')
  const [emailTo, setEmailTo] = useState('')
  const [emailPhone, setEmailPhone] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [mediaDetailDownloadEnabled, setMediaDetailDownloadEnabled] = useState(true)
  const [mediaDetailShareEnabled, setMediaDetailShareEnabled] = useState(true)
  const [mediaDetailSendByEmailEnabled, setMediaDetailSendByEmailEnabled] = useState(true)
  const [mediaDetailCardEnabled, setMediaDetailCardEnabled] = useState(true)
  const [mediaDetailAiToolEnabled, setMediaDetailAiToolEnabled] = useState(true)
  const [showCardModal, setShowCardModal] = useState(false)
  const [shareAppsEnabled, setShareAppsEnabled] = useState<Record<string, boolean>>({
    email: true, whatsapp: true, kakao: true, facebook: true, x: true, linkedin: true, reddit: true, youtube: true, tiktok: true, instagram: true,
  })
  const [retrying, setRetrying] = useState(false)
  const [closing, setClosing] = useState(false)
  const [overlayReveal, setOverlayReveal] = useState(false)
  /** When false (admin Media Badge "Comment" off), hide comment previews on this page. */
  const [commentBadgeEnabled, setCommentBadgeEnabled] = useState(true)
  const backNavigatingRef = useRef(false)
  /** Optional Azure Translator output for title + description (same locale as navbar). */
  const [i18nMedia, setI18nMedia] = useState<{ title: string; description: string | null } | null>(null)

  const { loaded: adminElevLoaded, contentElevated: adminContentElevated } = useAdminContentElevation()
  const isOwner = session?.user?.id === media?.user?.id
  const isAdmin = session?.user?.role === 'ADMIN'
  const canManage = isOwner || (isAdmin && adminElevLoaded && adminContentElevated)

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

  // Reflect like changes made from a feed card (or another open view) without refetching.
  useEffect(() => {
    return subscribeLikes((id, state) => {
      if (id !== mediaId) return
      setReactions((prev) => ({ ...prev, happy: state.happy }))
      setUserReaction(state.liked ? 'happy' : null)
    })
  }, [mediaId])

  // When media is not found (e.g. deleted and user pressed Back), go home so they don't see the error screen.
  // Use window.location so it works reliably inside intercepted route modals.
  useEffect(() => {
    if (!loading && !media) {
      window.location.href = '/'
    }
  }, [loading, media])

  // Trigger overlay opacity after paint so CSS transition runs (avoids flash on router.back()).
  useEffect(() => {
    if (!closing) return
    const id = requestAnimationFrame(() => setOverlayReveal(true))
    return () => cancelAnimationFrame(id)
  }, [closing])

  // Prefetch home so Back transition is fast and avoids black screen
  useEffect(() => {
    router.prefetch('/')
  }, [router])

  // Optional machine translation for title + body (`/api/translate/text`; MyMemory by default).
  // Same rules as feed cards: only when auto-translation is on and navbar mode is Local.
  useEffect(() => {
    if (!localTranslateEnabled) {
      setI18nMedia(null)
      return
    }
    if (!media) {
      setI18nMedia(null)
      return
    }
    const primary = (mtTag || 'en').toLowerCase().split('-')[0]
    if (primary === 'en') {
      setI18nMedia(null)
      return
    }
    let cancelled = false
    const rawTitle = stripHashtags(media.title)
    const rawDesc = media.description ?? ''
    const to = String(mtTag ?? 'en')
    fetch('/api/translate/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ texts: [rawTitle, rawDesc], to }),
    })
      .then(async (r) => {
        if (cancelled || !r.ok) return null
        return r.json() as Promise<{ translated?: unknown }>
      })
      .then((data: { translated?: unknown } | null) => {
        if (cancelled || !data) return
        const tr = data.translated
        if (Array.isArray(tr) && tr.length >= 2) {
          setI18nMedia({
            title: (typeof tr[0] === 'string' && tr[0]) || media.title,
            description: typeof tr[1] === 'string' && tr[1].trim() ? tr[1] : null,
          })
        } else {
          setI18nMedia(null)
        }
      })
      .catch(() => {
        if (!cancelled) setI18nMedia(null)
      })
    return () => {
      cancelled = true
    }
  }, [localTranslateEnabled, media?.id, media?.title, media?.description, mtTag])

  // Persist immediately so a fast Back still sees updated counts; merge is cheap (runs only when views/id change).
  useLayoutEffect(() => {
    if (!media?.id || typeof media.views !== 'number') return
    mergeStoredMediaViews(media.id, media.views)
  }, [media?.id, media?.views])

  useEffect(() => {
    const ac = new AbortController()
    const signal = ac.signal
    const applyMediaDetailSettings = async () => {
      try {
        const data = await fetchMediaDetailSettings()
        if (signal.aborted) return
        setMediaDetailDownloadEnabled(data.downloadEnabled)
        setMediaDetailShareEnabled(data.shareEnabled)
        setMediaDetailSendByEmailEnabled(data.sendByEmailEnabled)
        setMediaDetailCardEnabled(data.cardEnabled)
        setMediaDetailAiToolEnabled(data.aiToolEnabled)
        setShareAppsEnabled(data.shareAppsEnabled)
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        console.error('Error fetching media detail settings:', error)
      }
    }
    void applyMediaDetailSettings()
    const handler = () => {
      resetMediaDetailSettingsCache()
      void applyMediaDetailSettings()
    }
    window.addEventListener('mediaDetailUpdated', handler as EventListener)
    return () => {
      ac.abort()
      window.removeEventListener('mediaDetailUpdated', handler as EventListener)
    }
  }, [])

  useEffect(() => {
    const applyBadgeItems = (items: { itemKey: string; isEnabled: boolean }[]) => {
      if (items.length === 0) {
        setCommentBadgeEnabled(true)
        return
      }
      const row = items.find((i) => i.itemKey === 'comment')
      setCommentBadgeEnabled(row?.isEnabled !== false)
    }

    const loadCommentBadge = async (signal?: AbortSignal) => {
      try {
        const res = await fetch('/api/ui/badges', { signal, cache: 'no-store' })
        if (signal?.aborted) return
        if (!res.ok) return
        const data = await res.json()
        if (signal?.aborted) return
        applyBadgeItems((data.items || []) as { itemKey: string; isEnabled: boolean }[])
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        console.error('Error fetching media badge settings:', error)
      }
    }

    const ac = new AbortController()
    void loadCommentBadge(ac.signal)
    const onBadges = () => void loadCommentBadge()
    window.addEventListener('mediaBadgeSettingsUpdated', onBadges)
    return () => {
      ac.abort()
      window.removeEventListener('mediaBadgeSettingsUpdated', onBadges)
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
        const res = await fetch(`/api/media/${mediaId}?skipView=1&t=${Date.now()}`, { signal, cache: 'no-store' })
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
        publishLikes(mediaId, { happy: data.counts.happy, liked: data.userReaction === 'happy' })
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      console.error('Error fetching reactions:', error)
    }
  }

  const handleReaction = async (type: 'happy') => {
    // Block rapid double-clicks: a second request must not capture the first click's optimistic state as "prev".
    if (likeInFlightRef.current) return
    likeInFlightRef.current = true
    setLikePending(true)

    // Allow reactions without sign-in using visitorId
    const visitorId = getVisitorId()

    // Optimistic toggle; reconciled with the authoritative server response below.
    const wasLiked = userReaction === 'happy'
    const prevReactions = reactions
    const prevUserReaction = userReaction
    const optimisticHappy = Math.max(0, reactions.happy + (wasLiked ? -1 : 1))
    setReactions({ ...reactions, happy: optimisticHappy })
    setUserReaction(wasLiked ? null : 'happy')
    publishLikes(mediaId, { happy: optimisticHappy, liked: !wasLiked })

    try {
      const res = await fetch(`/api/media/${mediaId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, visitorId }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data?.counts && typeof data.counts.happy === 'number') {
          setReactions(data.counts)
          setUserReaction(data.userReaction)
          publishLikes(mediaId, { happy: data.counts.happy, liked: data.userReaction === 'happy' })
        } else {
          fetchReactions()
        }
      } else {
        // Roll back on failure.
        setReactions(prevReactions)
        setUserReaction(prevUserReaction)
        publishLikes(mediaId, { happy: prevReactions.happy, liked: prevUserReaction === 'happy' })
      }
    } catch (error) {
      console.error('Error setting reaction:', error)
      setReactions(prevReactions)
      setUserReaction(prevUserReaction)
      publishLikes(mediaId, { happy: prevReactions.happy, liked: prevUserReaction === 'happy' })
    } finally {
      likeInFlightRef.current = false
      setLikePending(false)
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
        alert(data.error || tMedia('checkoutFail'))
      }
    } catch (error) {
      console.error('Error starting checkout:', error)
      alert(tMedia('checkoutFailGeneric'))
    } finally {
      setBuyingMedia(false)
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const { triggerMediaDownload } = await import('@/lib/triggerMediaDownload')
      await triggerMediaDownload(mediaId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed. Please try again.'
      alert(message)
    } finally {
      setDownloading(false)
    }
  }

  const shareTitle = useMemo(() => {
    if (!media) return tMedia('checkThisOut')
    const src = i18nMedia?.title ?? media.title
    return stripHashtags(src)
  }, [media, i18nMedia, tMedia])

  const displayTitleSource = useMemo(
    () => (i18nMedia?.title ?? media?.title) || '',
    [i18nMedia, media?.title]
  )
  const displayDescriptionSource = useMemo(
    () => (i18nMedia ? i18nMedia.description : media?.description ?? null) as string | null,
    [i18nMedia, media?.description]
  )

  const handleShareClick = () => {
    pauseAllMedia()
    setShowShareModal(true)
  }

  // After paint, pause again so feed-card / preplay videos (intercepted modal) stop even if something raced play().
  useLayoutEffect(() => {
    if (!showShareModal) return
    pauseAllMedia()
  }, [showShareModal])

  const handleSendByEmail = async () => {
    if (emailDeliveryMethod === 'email') {
      const to = emailTo.trim()
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        alert(tMedia('invalidEmail'))
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
          setEmailPhone('')
          setEmailMessage('')
        } else {
          alert(data.error || tMedia('sendEmailFail'))
        }
      } catch {
        alert(tMedia('sendEmailFailGeneric'))
      } finally {
        setSendingEmail(false)
      }
    } else {
      const phone = emailPhone.trim()
      if (!phone) {
        alert(tMedia('enterPhone'))
        return
      }
      alert(tMedia('phoneNotAvailable'))
    }
  }

  const fetchMedia = async (signal?: AbortSignal) => {
    try {
      const cached = getMediaPlayCache(mediaId)
      if (cached && typeof cached === 'object' && (cached as { id?: string }).id === mediaId) {
        setMedia(cached as MediaDetail)
        setLoading(false)
        fetch(`/api/media/${mediaId}/play?t=${Date.now()}`, { cache: 'no-store' }).catch(() => {})
        fetch(`/api/media/${mediaId}?skipView=1&t=${Date.now()}`, { cache: 'no-store' })
          .then((r) => r.json())
          .then((full) => {
            if (full?.id === mediaId) setMedia(full)
          })
          .catch(() => {})
        return
      }
      const playRes = await fetch(`/api/media/${mediaId}/play?t=${Date.now()}`, { signal, cache: 'no-store' })
      const playData = await playRes.json()
      if (signal?.aborted) return
      if (playRes.ok) {
        setMedia(playData)
        setLoading(false)
        fetch(`/api/media/${mediaId}?skipView=1&t=${Date.now()}`, { cache: 'no-store' })
          .then((r) => r.json())
          .then((full) => {
            if (full?.id === mediaId) setMedia(full)
          })
          .catch(() => {})
        return
      }
      if (playRes.status === 404) {
        setMedia(null)
        setLoading(false)
        return
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      console.error('Error fetching media:', error)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(calendarLocaleFromUiTag(localeTag), {
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
        credentials: 'same-origin',
      })

      if (res.ok) {
        // Go to profile and replace history so Back doesn't return to the deleted media page
        const username = session?.user?.username || media.user.username
        router.replace(`/profile/${username}`)
      } else {
        const data = await res.json()
        if (res.status === 403 && data.code === 'ADMIN_CONTENT_ELEVATION_REQUIRED') {
          const next = encodeURIComponent(`/media/${mediaId}`)
          window.location.href = `/login/admin-verify?next=${next}`
          return
        }
        alert(data.error || tMedia('deleteFail'))
      }
    } catch (error) {
      console.error('Error deleting media:', error)
      alert(tMedia('deleteFailGeneric'))
    } finally {
      setDeleting(false)
      setShowDeleteModal(false)
    }
  }

  const latestCommentPreview = useMemo(() => {
    if (!commentBadgeEnabled || !media?.comments?.length) return []
    return media.comments
      .slice(0, 3)
      .map((c) => ({ id: c.id, content: c.content, username: c.user?.username ?? '' }))
  }, [commentBadgeEnabled, media])

  if (loading) {
    return (
      <div className="pb-[500px] min-h-screen bg-tank-black">
        {/* Skeleton: media area - matches real page layout to avoid black flash */}
        <div className="w-full bg-black pt-5">
          <div className="w-full max-w-4xl mx-auto px-4">
            <div className="relative w-full aspect-video max-h-[70vh] bg-tank-gray rounded-xl overflow-hidden">
              <div className="absolute inset-0 skeleton" />
            </div>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 pt-5 space-y-6">
          <div className="card">
            <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
              <div className="min-w-0 lg:flex-1 space-y-4">
                <div className="h-6 skeleton w-3/4 rounded" />
                <div className="flex flex-wrap gap-3">
                  <div className="h-4 skeleton w-16 rounded" />
                  <div className="h-4 skeleton w-24 rounded" />
                  <div className="h-4 skeleton w-20 rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!media) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-tank-black">
        <div className="text-center">
          <p className="text-gray-400 mb-4">{tMedia('mediaNotFound')}</p>
          <button
            className="btn-primary"
            onClick={() => { stopAllMedia(); window.location.href = '/' }}
          >
            {tMedia('goHome')}
          </button>
        </div>
      </div>
    )
  }

  // During processing, show the video as soon as we have a transcoded stream (e.g. 360p/480p from fast first-pass)
  const hasPreviewStream =
    media.type === 'VIDEO' &&
    media.processingStatus === 'processing' &&
    media.url &&
    /-(?:360p|480p|720p|1080p|hq)\.mp4/i.test(media.url)

  const handleLeaveDetail = () => {
    stopAllMedia()
    if (intercepted) {
      setClosing(true)
    } else {
      router.replace('/')
    }
  }

  return (
    <div className="pb-[500px]">
      {/* Fade-to-black overlay before router.back() when closing from intercepted modal (avoids flash). */}
      {intercepted && closing && (
        <div
          className={`fixed inset-0 z-[70] bg-tank-black transition-opacity duration-200 ${overlayReveal ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          onTransitionEnd={() => {
            if (backNavigatingRef.current) return
            backNavigatingRef.current = true
            router.back()
          }}
          aria-hidden
        />
      )}
      {/* Media Player - Full Width with top padding, content aligned to top */}
      <div className="relative w-full bg-black pt-5">
        {downloading && <MediaDownloadingOverlay label={tMedia('downloading')} />}
        {media.processingStatus === 'pending' || (media.processingStatus === 'processing' && !hasPreviewStream) ? (
          <div className="flex justify-center px-4">
            <div className="relative w-full max-w-2xl aspect-video bg-black overflow-hidden rounded-xl border border-tank-light">
              {/* Processing thumbnail: uploader can check status here; hidden from homepage until completed */}
              {media.thumbnailUrl ? (
                <img
                  src={media.thumbnailUrl}
                  alt={displayTitleSource}
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
                <p className="text-white font-semibold mb-1">{tMedia('processingTitle')}</p>
                <p className="text-gray-300 text-sm max-w-md text-center px-4 mb-2">
                  {tMedia('processingBody')}
                </p>
                {isOwner && (
                  <p className="text-tank-accent/90 text-xs">
                    {tMedia('processingOwnerNote')}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : hasPreviewStream ? (
          <div className="no-touch-callout" onContextMenu={(e) => e.preventDefault()}>
            <MediaPlayer
              type={media.type}
              url={(media as any).streamUrl ?? media.url}
              streamRenditions={(media as { streamRenditions?: { height: number; url: string }[] }).streamRenditions}
              title={displayTitleSource}
              thumbnailUrl={media.thumbnailUrl}
              autoUnmuteOnMount
              playbackSuspended={showShareModal}
            />
          </div>
        ) : media.processingStatus === 'failed' ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <svg className="w-12 h-12 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="text-lg font-semibold text-red-400 mb-2">{tMedia('failedTitle')}</h3>
            <p className="text-gray-400 text-sm max-w-md mb-2">
              {tMedia('failedBody')}
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
                    const res = await fetch(`/api/media/${mediaId}/retry-processing`, {
                      method: 'POST',
                      credentials: 'same-origin',
                    })
                    const data = await res.json()
                    if (!res.ok) {
                      if (res.status === 403 && data.code === 'ADMIN_CONTENT_ELEVATION_REQUIRED') {
                        const next = encodeURIComponent(`/media/${mediaId}`)
                        window.location.href = `/login/admin-verify?next=${next}`
                        return
                      }
                      alert(data.error || tMedia('retryFailed'))
                      return
                    }
                    const r = await fetch(`/api/media/${mediaId}?skipView=1&t=${Date.now()}`, { cache: 'no-store' })
                    if (r.ok) {
                      const updated = await r.json()
                      setMedia(updated)
                    }
                  } catch (e) {
                    console.error('Retry failed:', e)
                    alert(tMedia('retryFailedAlert'))
                  } finally {
                    setRetrying(false)
                  }
                }}
                disabled={retrying}
                className="px-4 py-2 bg-tank-accent hover:bg-tank-accent/90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {retrying ? tMedia('retrying') : tMedia('retryProcessing')}
              </button>
            )}
          </div>
        ) : (
          <div className="no-touch-callout" onContextMenu={(e) => e.preventDefault()}>
            <MediaPlayer
              type={media.type}
              url={(media as any).streamUrl ?? media.url}
              streamRenditions={(media as { streamRenditions?: { height: number; url: string }[] }).streamRenditions}
              title={displayTitleSource}
              thumbnailUrl={media.thumbnailUrl}
              autoUnmuteOnMount
              playbackSuspended={showShareModal}
            />
          </div>
        )}
      </div>

      {/* Content below media */}
      <div className="max-w-4xl mx-auto px-4 pt-5 space-y-6">
        {/* Info Card - Two Column Layout */}
        <div className="card">
          {/* Title row + close — full width at top of card */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0 flex-1 flex items-center gap-2 overflow-hidden">
              <h1
                className="font-semibold text-white truncate min-w-0"
                title={stripHashtags(displayTitleSource)}
              >
                {formatMediaTitle(displayTitleSource, 60)}
              </h1>
              {canManage && (
                <a
                  href={`/media/${mediaId}/edit`}
                  className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-500 rounded-lg transition-colors flex-shrink-0 text-white text-sm font-semibold no-touch-callout"
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {tMedia('edit')}
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={handleLeaveDetail}
              className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:text-white hover:bg-tank-light/40 transition-colors -mt-0.5 -mr-0.5"
              aria-label={tMedia('close')}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
            {/* Left Column: Metadata, Views, Reactions */}
            <div className="min-w-0 lg:flex-1">
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
                  {media.type === 'VIDEO' ? tMedia('typeVideo') : media.type === 'IMAGE' ? tMedia('typeImage') : tMedia('typeMusic')}
                </span>
                <span>{formatDate(media.createdAt)}</span>
                <span>
                  {tMedia('createdBy')}{' '}
                  <Link href={`/profile/${media.user.username}`} className="text-tank-accent hover:underline font-medium">
                    {media.user.username}
                  </Link>
                </span>
                {mediaDetailAiToolEnabled && media.aiTool && (
                  <span>
                    <span className="text-gray-500">{tMedia('aiTool')}</span>
                    <span className="ml-1 text-tank-accent">{media.aiTool}</span>
                  </span>
                )}
              </div>

              {/* Views + Reactions Row */}
              <div className="flex items-center gap-6 mb-4">
                {/* Views */}
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span>{formatMediaViewsLabel(media.views, localeTag)}</span>
                </div>

                {/* Reactions (like only) — icon sizing matches MediaCard; count text matches views row */}
                <button
                  type="button"
                  onClick={() => handleReaction('happy')}
                  disabled={likePending}
                  className={`flex items-center gap-2 text-sm text-gray-400 transition-transform hover:scale-110 disabled:opacity-60 disabled:pointer-events-none ${
                    userReaction === 'happy' ? 'scale-110' : ''
                  }`}
                  aria-label={userReaction === 'happy' ? tMedia('unlike') : tMedia('like')}
                >
                  <ThumbsUpIcon
                    className={`w-4 h-4 shrink-0 ${
                      userReaction === 'happy'
                        ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]'
                        : 'text-gray-400'
                    }`}
                  />
                  <span>{reactions.happy}</span>
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
                {isSaved ? tMedia('savedToMyContents') : tMedia('saveToMyContents')}
              </button>

              {/* Download & Share row */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Download — free content for all visitors (guests get watermarked file); owners always */}
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
                    {downloading ? tMedia('downloading') : tMedia('download')}
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
                      {shareStatus === 'copied' ? tMedia('copied') : tMedia('share')}
                    </button>
                    {mediaDetailSendByEmailEnabled && (
                      <button
                        type="button"
                        onClick={() => {
                          const who =
                            session?.user?.legalName?.trim() || session?.user?.name?.trim() || ''
                          setEmailMessage(
                            who
                              ? mediaPageInterpolate(tMedia('emailThoughtLine'), { who })
                              : tMedia('emailThoughtAnonymous')
                          )
                          setShowEmailModal(true)
                        }}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap bg-tank-gray border border-tank-light text-white hover:bg-tank-light"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        {tMedia('sendByEmail')}
                      </button>
                    )}
                  </>
                )}

                {mediaDetailCardEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!session) {
                        router.push('/login')
                        return
                      }
                      setShowCardModal(true)
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap bg-tank-gray border border-tank-light text-white hover:bg-tank-light"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
                      />
                    </svg>
                    {tMedia('card')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Description + Comment sections — below action row */}
          {(latestCommentPreview.length > 0 || displayDescriptionSource) && (
            <div className="mt-6 w-full border-t border-tank-light/20 pt-6 space-y-4">
              {displayDescriptionSource && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-white/90">Description</h3>
                  <p className="text-gray-300 whitespace-pre-wrap break-words">
                    {displayDescriptionSource}
                  </p>
                </section>
              )}
              {latestCommentPreview.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-white/90">Comment</h3>
                  <div className="space-y-1.5">
                    {latestCommentPreview.map((c) => (
                      <p
                        key={c.id}
                        className="text-sm text-gray-400 leading-snug whitespace-pre-wrap break-words"
                      >
                        <span className="inline-flex items-start gap-2">
                          {c.username ? (
                            <span className="shrink-0 text-white/90 font-semibold">@{c.username}</span>
                          ) : null}
                          <TranslatedPlaintext
                            as="span"
                            text={c.content}
                            translateEnabled={localTranslateEnabled}
                            mtLocaleTagOverride={mtTag}
                          />
                        </span>
                      </p>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

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
              {buyingMedia
                ? tMedia('processingShort')
                : mediaPageInterpolate(tMedia('buyNowWithPrice'), { price: `$${media.price.toFixed(2)}` })}
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
              {mediaPageInterpolate(tMedia('yourPriceWithAmount'), { price: `$${media.price.toFixed(2)}` })}
            </div>
          )}
        </div>
      </div>

      <MediaShareModal
        open={showShareModal && Boolean(media)}
        onClose={() => setShowShareModal(false)}
        mediaId={mediaId}
        shareTitle={shareTitle}
        shareDescription={displayDescriptionSource}
        thumbnailUrl={media?.thumbnailUrl}
        shareAppsEnabled={shareAppsEnabled}
        onCopyStatusChange={setShareStatus}
      />

      {showCardModal && media && (
        <CelebrationCardModal
          mediaId={mediaId}
          mediaTitle={shareTitle}
          onClose={() => setShowCardModal(false)}
        />
      )}

      {/* Send by email modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4" onClick={() => !sendingEmail && setShowEmailModal(false)}>
          <div className="max-w-md w-full rounded-2xl overflow-hidden shadow-2xl border border-[#1a5c66] relative" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button
              type="button"
              onClick={() => !sendingEmail && setShowEmailModal(false)}
              className="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-gray-600/80 hover:bg-gray-500/80 text-white transition-colors"
              aria-label={tMedia('close')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {/* FROM */}
            <div className="bg-[#1a6e7a] px-5 py-3">
              <p className="text-white font-medium">
                <span className="text-sm font-semibold text-white/80 uppercase tracking-wide">{tMedia('from')} </span>
                <span className="bg-[#0f3f47] px-2 py-0.5 rounded text-sm">AI Media Tank (AiM) &lt;aimediatank@aimediatank.com&gt;</span>
              </p>
            </div>

            {/* TO */}
            <div className="bg-[#17626c] px-5 py-3 border-t border-[#1a5c66]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-white/80 uppercase tracking-wide shrink-0">{tMedia('to')}</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEmailDeliveryMethod('email')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      emailDeliveryMethod === 'email'
                        ? 'bg-white text-[#17626c]'
                        : 'bg-[#1a6e7a] text-white/70 hover:text-white'
                    }`}
                  >
                    {tMedia('emailTab')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailDeliveryMethod('phone')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      emailDeliveryMethod === 'phone'
                        ? 'bg-white text-[#17626c]'
                        : 'bg-[#1a6e7a] text-white/70 hover:text-white'
                    }`}
                  >
                    {tMedia('phoneTab')}
                  </button>
                </div>
              </div>
              {emailDeliveryMethod === 'email' ? (
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder={tMedia('placeholderEmail')}
                  className="w-full px-4 py-2.5 rounded-lg bg-[#0f3f47] border border-[#1a6e7a] text-white placeholder-white/40 text-sm focus:outline-none focus:border-white/50"
                  disabled={sendingEmail}
                />
              ) : (
                <input
                  type="tel"
                  value={emailPhone}
                  onChange={(e) => setEmailPhone(e.target.value)}
                  placeholder={tMedia('placeholderPhone')}
                  className="w-full px-4 py-2.5 rounded-lg bg-[#0f3f47] border border-[#1a6e7a] text-white placeholder-white/40 text-sm focus:outline-none focus:border-white/50"
                  disabled={sendingEmail}
                />
              )}
            </div>

            {/* Media preview */}
            <div className="bg-[#0f3f47] px-5 py-4 border-t border-[#1a5c66]">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[#17626c]/50 border border-[#1a5c66]">
                {media.thumbnailUrl ? (
                  <img
                    src={media.thumbnailUrl}
                    alt={stripHashtags(displayTitleSource)}
                    className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-[#1a5c66] flex items-center justify-center flex-shrink-0">
                    <svg className="w-7 h-7 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{stripHashtags(displayTitleSource)}</p>
                  <p className="text-white/50 text-xs mt-0.5">{tMedia('thumbEmailNote')}</p>
                </div>
              </div>
              <p className="text-white/50 text-sm mt-3">
                {tMedia('recipientEmailNote')}
              </p>
            </div>

            {/* Message */}
            <div className="bg-[#1a6e7a] px-5 py-4 border-t border-[#1a5c66]">
              <label className="text-sm font-semibold text-white/80">
                {tMedia('message')}
              </label>
              <textarea
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                placeholder={tMedia('messagePlaceholder')}
                rows={2}
                className="w-full mt-2 px-4 py-2.5 rounded-lg bg-[#0f3f47] border border-[#1a6e7a] text-white placeholder-white/40 text-sm focus:outline-none focus:border-white/50 resize-none"
                disabled={sendingEmail}
              />
            </div>

            {/* Cancel / Send buttons */}
            <div className="flex border-t border-[#1a5c66]">
              <button
                type="button"
                onClick={() => !sendingEmail && setShowEmailModal(false)}
                className="flex-1 bg-[#14555e] hover:bg-[#175f69] px-5 py-4 text-white/70 hover:text-white font-bold text-lg transition-colors border-r border-[#1a5c66]"
                disabled={sendingEmail}
              >
                {tMedia('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSendByEmail}
                disabled={sendingEmail || (emailDeliveryMethod === 'email' ? !emailTo.trim() : !emailPhone.trim())}
                className="flex-1 bg-[#14555e] hover:bg-[#175f69] disabled:opacity-50 px-5 py-4 text-white font-bold text-lg transition-colors"
              >
                {sendingEmail ? tMedia('sending') : tMedia('send')}
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
                <h3 className="text-xl font-semibold">{tMedia('deleteMedia')}</h3>
                <p className="text-sm text-gray-400">{tMedia('cannotUndo')}</p>
              </div>
            </div>
            <p className="text-gray-300 mb-6">
              {mediaPageInterpolate(tMedia('deleteConfirm'), {
                title: stripHashtags(displayTitleSource),
              })}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="btn-secondary flex-1" disabled={deleting}>
                {tMedia('cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? tMedia('deleting') : tMedia('delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back Button - when intercepted, fade out then router.back() to avoid flash; else go to homepage */}
      <div className="max-w-4xl mx-auto px-4 mt-8">
        <button
          type="button"
          onClick={handleLeaveDetail}
          className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg transition-colors"
        >
          {tMedia('back')}
        </button>
      </div>
    </div>
  )
}

