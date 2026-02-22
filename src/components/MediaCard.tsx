'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { formatMediaTitle, stripHashtags } from '@/lib/text'

interface MediaCardProps {
  media: {
    id: string
    title: string
    type: string
    url: string
    thumbnailUrl?: string | null
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

let badgeItemsCache: BadgeItem[] | null = null
let badgeItemsPromise: Promise<BadgeItem[] | null> | null = null

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
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false)
  const [thumbnailError, setThumbnailError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const preplayVideoRef = useRef<HTMLVideoElement>(null)
  const [preplayHover, setPreplayHover] = useState(false)
  const [badgeItems, setBadgeItems] = useState<BadgeItem[] | null>(badgeItemsCache)
  const cardRef = useRef<HTMLDivElement>(null)
  const [isInView, setIsInView] = useState(false)

  // Only mount video elements when card is in or near viewport to avoid 200+ videos in DOM (performance)
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        if (e) setIsInView(e.isIntersecting)
      },
      { rootMargin: '150px 0px 300px 0px', threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

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
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`
    if (days < 365) return `${Math.floor(days / 30)} months ago`
    return `${Math.floor(days / 365)} years ago`
  }

  const typeStyle = getTypeStyle()

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

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    // Only save scroll target when on the home page (not on profile or other pages)
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
  }

  const isPreplayVideo = preplay && media.type === 'VIDEO' && (!media.processingStatus || media.processingStatus === 'completed')
  const handlePreplayPointerEnter = () => {
    if (!isPreplayVideo) return
    setPreplayHover(true)
    if (thumbnailSrc && !thumbnailError) {
      preplayVideoRef.current?.play().catch(() => {})
    } else if (showVideoElement) {
      videoRef.current?.play().catch(() => {})
    }
  }
  const handlePreplayPointerLeave = () => {
    if (!isPreplayVideo) return
    setPreplayHover(false)
    if (thumbnailSrc && !thumbnailError) {
      preplayVideoRef.current?.pause()
    } else if (showVideoElement) {
      videoRef.current?.pause()
    }
  }

  // Mobile: no hover; play() must run from touchstart for autoplay. Keep focus/tap-highlight off to avoid green mask.
  const handlePreplayTouchStart = () => {
    if (!isPreplayVideo) return
    setPreplayHover(true)
    if (thumbnailSrc && !thumbnailError) {
      preplayVideoRef.current?.play().catch(() => {})
    } else if (showVideoElement) {
      videoRef.current?.play().catch(() => {})
    }
  }
  const handlePreplayTouchEnd = () => {
    if (!isPreplayVideo) return
    setPreplayHover(false)
    if (thumbnailSrc && !thumbnailError) {
      preplayVideoRef.current?.pause()
    } else if (showVideoElement) {
      videoRef.current?.pause()
    }
  }

  return (
    <Link
      href={`/media/${media.id}`}
      onClick={handleClick}
      data-media-id={media.id}
      className="group cursor-pointer block focus:outline-none [-webkit-tap-highlight-color:transparent]"
    >
      <div ref={cardRef} className="bg-tank-gray rounded-xl overflow-hidden border border-tank-light hover:border-tank-accent/50 transition-all duration-300 hover:shadow-lg hover:shadow-tank-accent/10">
        {/* Thumbnail — natural aspect ratio for masonry layout */}
        <div
          className="relative bg-tank-dark overflow-hidden outline-none [-webkit-tap-highlight-color:transparent]"
          onPointerEnter={handlePreplayPointerEnter}
          onPointerLeave={handlePreplayPointerLeave}
          onTouchStart={handlePreplayTouchStart}
          onTouchEnd={handlePreplayTouchEnd}
          onTouchCancel={handlePreplayTouchEnd}
        >
          {/* Skeleton placeholder while thumbnail loads */}
          {thumbnailSrc && !thumbnailLoaded && !thumbnailError && (
            <div className="aspect-video skeleton" />
          )}

          {isBadgeEnabled('ai') && (
            <div className="absolute top-2 left-2 z-10 px-2 py-1 rounded-md text-[11px] font-bold uppercase bg-black/70 text-white backdrop-blur-sm">
              {aiLabel}
            </div>
          )}

          {/* Price and Sold badges - render independently based on their own settings */}
          {(priceLabel && isBadgeEnabled('price')) || (showSoldBadge && isBadgeEnabled('sold')) ? (
            <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1">
              {priceLabel && isBadgeEnabled('price') && (
                <div className="px-2 py-1 rounded-md text-[11px] font-bold bg-black/70 text-white backdrop-blur-sm">
                  {priceLabel}
                </div>
              )}
              {showSoldBadge && isBadgeEnabled('sold') && (
                <div className="flex justify-end">
                  <svg
                    className="w-3.5 h-3.5 text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.9)]"
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
                  src={media.url}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 pointer-events-none ${preplayHover ? 'opacity-100' : 'opacity-0'}`}
                  muted
                  playsInline
                  preload="metadata"
                  loop
                />
              )}
              {/* When Preplay is OFF, still preload metadata so media detail page loads faster when user clicks */}
              {!preplay && media.type === 'VIDEO' && isInView && (!media.processingStatus || media.processingStatus === 'completed') && (
                <video
                  src={media.url}
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
              src={media.url}
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
              onError={() => setThumbnailError(true)}
            />
          ) : media.type === 'VIDEO' ? (
            // Video gradient placeholder when video fails to load
            <div className={`w-full aspect-video bg-gradient-to-br ${typeStyle.gradient} flex items-center justify-center`}>
              <div className="text-white/80 scale-[3]">
                {getTypeIcon()}
              </div>
            </div>
          ) : (
            // Gradient placeholder for music or failed loads
            <div className={`w-full aspect-video bg-gradient-to-br ${typeStyle.gradient} flex items-center justify-center`}>
              <div className="text-white/80 scale-[3]">
                {getTypeIcon()}
              </div>
            </div>
          )}


          {/* Processing overlay: thumbnail visible beneath (same idea as media detail page) */}
          {media.processingStatus && media.processingStatus !== 'completed' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20">
              {media.processingStatus === 'failed' ? (
                <p className="text-red-400 text-xs font-medium">Processing failed</p>
              ) : (
                <>
                  <div className="w-8 h-8 border-3 border-tank-accent/30 border-t-tank-accent rounded-full animate-spin mb-2" />
                  <p className="text-white/80 text-xs font-medium">Processing...</p>
                </>
              )}
            </div>
          )}

          {/* Music wave animation overlay */}
          {media.type === 'MUSIC' && (
            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-center gap-1 h-8">
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


        </div>

        {/* Content */}
        <div className="p-4">
          {/* Title and Type Badge */}
          <div className="flex items-center gap-2 mb-2">
            <h3
              className="font-semibold text-white group-hover:text-tank-accent transition-colors truncate flex-1 min-w-0"
              title={stripHashtags(media.title)}
            >
              {renderTitle(media.title)}
            </h3>
            {/* Media Type Badge */}
            <div className={`px-2 py-1 ${typeStyle.text} text-xs font-bold flex items-center gap-1 shrink-0`}>
              {getTypeIcon()}
              <span>{media.type}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-sm text-gray-300">
            <div className="flex items-center gap-3">
              {/* Views */}
              {isBadgeEnabled('views') && (
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {formatViews(media.views)}
                </span>
              )}

              {isBadgeEnabled('smileRate') && (
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <span>😄</span>
                    <span>{media.reactions?.happy ?? 0}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span>😞</span>
                    <span>{media.reactions?.sad ?? 0}</span>
                  </span>
                </span>
              )}
            </div>

            {isBadgeEnabled('postDate') && <span>{formatDate(media.createdAt)}</span>}
          </div>
        </div>
      </div>
    </Link>
  )
}
