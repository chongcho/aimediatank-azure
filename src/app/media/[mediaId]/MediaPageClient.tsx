'use client'

import { useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MediaPlayer from '@/components/MediaPlayer'
import { formatMediaTitle, stripHashtags } from '@/lib/text'
import { pauseAllMedia, stopAllMedia } from '@/lib/mediaStop'
import { getMediaPlayCache } from '@/lib/mediaPlayCache'
import { mergeStoredMediaViews } from '@/lib/mediaViewsSync'
import { calendarLocaleFromUiTag } from '@/lib/localeUi'
import { useKakaoJsKey } from '@/components/KakaoConfigProvider'
import { ThumbsUpIcon } from '@/components/ThumbsUpIcon'
import { TranslatedPlaintext } from '@/components/TranslatedPlaintext'
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
  const { mtTag, guestLocal, ensureGuestGeoLoaded } = useGuestFeedLocalTargets(autoTranslationEnabled)
  useEffect(() => {
    if (guestLocal) void ensureGuestGeoLoaded()
  }, [guestLocal, ensureGuestGeoLoaded])
  const router = useRouter()
  const [media, setMedia] = useState<MediaDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [reactions, setReactions] = useState({ happy: 0, sad: 0 })
  const [userReaction, setUserReaction] = useState<'happy' | 'sad' | 'neutral' | null>(null)
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
  const [mediaDetailAiToolEnabled, setMediaDetailAiToolEnabled] = useState(true)
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

  const kakaoJsKey = useKakaoJsKey()
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
  useEffect(() => {
    if (!autoTranslationEnabled) {
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
  }, [autoTranslationEnabled, media?.id, media?.title, media?.description, mtTag])

  // Persist immediately so a fast Back still sees updated counts; merge is cheap (runs only when views/id change).
  useLayoutEffect(() => {
    if (!media?.id || typeof media.views !== 'number') return
    mergeStoredMediaViews(media.id, media.views)
  }, [media?.id, media?.views])

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
          setMediaDetailAiToolEnabled(data.aiToolEnabled !== false)
          if (data.shareAppsEnabled && typeof data.shareAppsEnabled === 'object' && !Array.isArray(data.shareAppsEnabled)) {
            setShareAppsEnabled((prev) => ({ ...prev, ...data.shareAppsEnabled }))
          }
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
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      console.error('Error fetching reactions:', error)
    }
  }

  const handleReaction = async (type: 'happy') => {
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

  /** @returns true if clipboard copy succeeded (share POST fired inside); false if no URL or prompt fallback */
  const handleCopyLink = async (): Promise<boolean> => {
    if (!shareUrl) return false
    try {
      await navigator.clipboard.writeText(shareUrl)
      fetch(`/api/media/${mediaId}/share`, { method: 'POST' }).catch(() => {})
      setShareStatus('copied')
      setTimeout(() => setShareStatus('idle'), 2000)
      return true
    } catch {
      window.prompt('Copy this link:', shareUrl)
      return false
    }
  }

  const recordShareAction = () => {
    fetch(`/api/media/${mediaId}/share`, { method: 'POST' }).catch(() => {})
  }

  const handleKakaoShare = () => {
    if (!shareUrl || !media) return
    const w = typeof window !== 'undefined' ? window : null
    type KakaoWindow = {
      Kakao?: {
        isInitialized?: () => boolean
        Share?: { sendDefault: (opts: unknown) => void }
      }
    }
    const Kakao = w && (w as unknown as KakaoWindow).Kakao
    const shareApi = Kakao?.Share
    const runKakaoCopyFallback = () => {
      void handleCopyLink().then((recorded) => {
        if (!recorded) recordShareAction()
        else setShowShareModal(false)
      })
    }
    // Script tag can load before onLoad runs Kakao.init(); sendDefault before init often does nothing.
    if (!shareApi?.sendDefault) {
      runKakaoCopyFallback()
      return
    }
    if (typeof Kakao?.isInitialized === 'function' && !Kakao.isInitialized()) {
      runKakaoCopyFallback()
      return
    }
    const imageUrl = media.thumbnailUrl || undefined
    try {
      // Call as shareApi.sendDefault(...) so SDK keeps correct `this` (do not assign method to a bare variable).
      shareApi.sendDefault({
        objectType: 'feed',
        content: {
          title: shareTitle,
          description: displayDescriptionSource || shareTitle,
          // Kakao's image scraper requires an HTTPS, publicly-reachable URL; HTTP/local URLs cause the share card to fail.
          imageUrl: imageUrl && imageUrl.startsWith('https://') ? imageUrl : undefined,
          link: {
            mobileWebUrl: shareUrl,
            webUrl: shareUrl,
          },
        },
        buttons: [
          {
            title: tMedia('view'),
            link: {
              mobileWebUrl: shareUrl,
              webUrl: shareUrl,
            },
          },
        ],
      })
      recordShareAction()
      setShowShareModal(false)
    } catch (err) {
      // sendDefault may open the popup successfully and still throw a non-fatal SDK error afterwards (e.g. metadata warning).
      // Do not auto-copy in that case — it produces a misleading "Copied" toast on top of a working Kakao popup.
      // The earlier guards (no SDK / not initialized) already handle the genuine "couldn't open Kakao" cases.
      // eslint-disable-next-line no-console
      console.warn('[Kakao.Share.sendDefault]', err)
      setShowShareModal(false)
    }
  }

  /** Instagram has no public sharer URL (unlike LinkedIn/X). Prefer Web Share (mobile can target the IG app), else Threads web intent composer with link prefilled. */
  const handleInstagramShare = async () => {
    if (!shareUrl) return
    const body = `${shareTitle}\n\n${shareUrl}`
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          text: body,
          url: shareUrl,
        })
        recordShareAction()
        setShowShareModal(false)
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    const intent = `https://www.threads.net/intent/post?text=${encodeURIComponent(body)}`
    window.open(intent, '_blank', 'noopener,noreferrer')
    recordShareAction()
  }

  /** TikTok has no public web share URL/SDK. Prefer Web Share (mobile can target the TikTok app); on desktop, copy link and open the TikTok upload page so the user can paste. */
  const handleTikTokShare = async () => {
    if (!shareUrl) return
    const body = `${shareTitle}\n\n${shareUrl}`
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          text: body,
          url: shareUrl,
        })
        recordShareAction()
        setShowShareModal(false)
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    void handleCopyLink().then((copied) => {
      if (!copied) recordShareAction()
    })
    window.open('https://www.tiktok.com/upload', '_blank', 'noopener,noreferrer')
  }

  /** YouTube has no public web share URL. Prefer Web Share (mobile can target the YouTube/Studio app); on desktop, copy link and open YouTube Studio so the user can paste into a video/community post. */
  const handleYouTubeShare = async () => {
    if (!shareUrl) return
    const body = `${shareTitle}\n\n${shareUrl}`
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          text: body,
          url: shareUrl,
        })
        recordShareAction()
        setShowShareModal(false)
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    void handleCopyLink().then((copied) => {
      if (!copied) recordShareAction()
    })
    window.open('https://studio.youtube.com/', '_blank', 'noopener,noreferrer')
  }

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
      <div className="w-full bg-black pt-5">
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
                  className={`flex items-center gap-2 text-sm text-gray-400 transition-transform hover:scale-110 ${
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
                    {downloading ? tMedia('preparing') : tMedia('download')}
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
                            translateEnabled={autoTranslationEnabled}
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

      {/* Share modal — YouTube-style: link, Copy, and curated share options only */}
      {showShareModal && media && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowShareModal(false)}>
          <div className="card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{tMedia('shareModalTitle')}</h3>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-600/80 hover:bg-gray-500/80 text-white transition-colors"
                aria-label={tMedia('close')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-gray-300 text-sm truncate mb-1" title={shareTitle}>{shareTitle}</p>
            <div className="flex items-center gap-2 mb-5">
              <p className="flex-1 min-w-0 text-gray-500 text-xs truncate font-mono" title={shareUrl}>{shareUrl}</p>
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="shrink-0 w-10 h-10 rounded-lg bg-tank-accent text-tank-black hover:opacity-90 transition-opacity flex items-center justify-center"
                title={shareStatus === 'copied' ? tMedia('copied') : tMedia('copy')}
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
              {shareAppsEnabled.email !== false && (
                <a
                  href={`mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(
                    media?.thumbnailUrl ? `${shareTitle}\n\n${media.thumbnailUrl}\n\n${shareUrl}` : shareUrl
                  )}`}
                  onClick={() => { recordShareAction(); setShowShareModal(false); }}
                  className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors"
                  title={tMedia('emailAppHint')}
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs">Email</span>
                </a>
              )}
              {shareAppsEnabled.whatsapp !== false && (
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
              )}
              {shareAppsEnabled.kakao !== false && (
                <button
                  type="button"
                  onClick={handleKakaoShare}
                  className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors"
                  title={kakaoJsKey ? tMedia('kakaoSdk') : tMedia('kakaoCopy')}
                >
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3c5.799 0 10.5 3.664 10.5 8.185 0 4.52-4.701 8.184-10.5 8.184a13.5 13.5 0 0 1-1.727-.11l-4.408 2.883c-.501.328-1.235.044-1.235-.499V17.14c-3.336-1.725-5.63-4.592-5.63-5.955C0 6.665 4.701 3 12 3Z" />
                  </svg>
                  <span className="text-xs">KakaoTalk</span>
                </button>
              )}
              {shareAppsEnabled.facebook !== false && (
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
              )}
              {shareAppsEnabled.x !== false && (
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
              )}
              {shareAppsEnabled.linkedin !== false && (
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
              )}
              {shareAppsEnabled.reddit !== false && (
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
              )}
              {shareAppsEnabled.youtube !== false && (
                <button
                  type="button"
                  onClick={() => void handleYouTubeShare()}
                  className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors"
                  title={tMedia('youtubeCopied')}
                >
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                  <span className="text-xs">YouTube</span>
                </button>
              )}
              {shareAppsEnabled.tiktok !== false && (
                <button
                  type="button"
                  onClick={() => void handleTikTokShare()}
                  className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors"
                  title={tMedia('tiktokCopied')}
                >
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                  </svg>
                  <span className="text-xs">TikTok</span>
                </button>
              )}
              {shareAppsEnabled.instagram !== false && (
                <button
                  type="button"
                  onClick={() => void handleInstagramShare()}
                  className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors"
                  title={tMedia('instagramShare')}
                >
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948 2.3 4.022 7.099 4.022 9.196 4.022 2.096 0 6.896 0 9.196-4.022.058-1.28.072-1.689.072-4.948 0-3.259-.014-3.667-.072-4.947-.2-4.364-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                  <span className="text-xs">Instagram</span>
                </button>
              )}
            </div>
          </div>
        </div>
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

