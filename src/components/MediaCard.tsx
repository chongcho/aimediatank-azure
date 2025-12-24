'use client'

import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'

interface MediaCardProps {
  media: {
    id: string
    title: string
    type: string
    url: string
    thumbnailUrl?: string | null
    aiTool?: string | null
    price?: number | null
    isSold?: boolean
    soldAt?: string | null
    daysRemaining?: number | null
    views: number
    avgRating: number
    createdAt: string
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
}

export default function MediaCard({ media }: MediaCardProps) {
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false)
  const [thumbnailError, setThumbnailError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Remove hashtags from title for display (hashtags are only used for search)
  const renderTitle = (title: string) => {
    return title.replace(/#\w+/g, '').trim()
  }

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
          shadow: 'shadow-red-500/30'
        }
      case 'IMAGE':
        return {
          gradient: 'from-blue-500 to-cyan-500',
          bg: 'bg-blue-500/90',
          shadow: 'shadow-blue-500/30'
        }
      case 'MUSIC':
        return {
          gradient: 'from-purple-500 to-pink-500',
          bg: 'bg-purple-500/90',
          shadow: 'shadow-purple-500/30'
        }
      default:
        return {
          gradient: 'from-gray-500 to-gray-600',
          bg: 'bg-gray-500/90',
          shadow: 'shadow-gray-500/30'
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

  return (
    <Link href={`/media/${media.id}`} className="group">
      <div className="bg-tank-gray rounded-2xl overflow-hidden border border-tank-light hover:border-tank-accent/50 transition-all duration-300 hover:shadow-lg hover:shadow-tank-accent/10">
        {/* Thumbnail */}
        <div className="relative aspect-video bg-tank-dark overflow-hidden">
          {thumbnailSrc && !thumbnailError ? (
            <img
              src={thumbnailSrc}
              alt={media.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              onLoad={() => setThumbnailLoaded(true)}
              onError={() => setThumbnailError(true)}
            />
          ) : showVideoElement ? (
            // Show video element as fallback for videos - improved for mobile
            <video
              ref={videoRef}
              src={media.url}
              className="w-full h-full object-cover"
              muted
              playsInline
              preload="metadata"
              poster="" // Empty poster to show first frame
              onLoadedMetadata={(e) => {
                // Try to seek to 1 second for a better thumbnail frame
                const video = e.currentTarget
                if (video.duration > 1) {
                  video.currentTime = 1
                }
              }}
              onError={() => setThumbnailError(true)}
            />
          ) : media.type === 'VIDEO' ? (
            // Video gradient placeholder when video fails to load
            <div className={`w-full h-full bg-gradient-to-br ${typeStyle.gradient} flex items-center justify-center`}>
              <div className="text-white/80 scale-[3]">
                {getTypeIcon()}
              </div>
            </div>
          ) : (
            // Gradient placeholder for music or failed loads
            <div className={`w-full h-full bg-gradient-to-br ${typeStyle.gradient} flex items-center justify-center`}>
              <div className="text-white/80 scale-[3]">
                {getTypeIcon()}
              </div>
            </div>
          )}


          {/* Play overlay for videos */}
          {media.type === 'VIDEO' && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
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

          {/* SOLD Badge */}
          {media.isSold && (
            <div className="absolute top-3 left-3 z-10">
              <div className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                SOLD
              </div>
            </div>
          )}

        </div>

        {/* Content */}
        <div className="p-4">
          {/* Title */}
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-white group-hover:text-tank-accent transition-colors truncate flex-1" title={media.title}>
              {renderTitle(media.title)}
            </h3>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center gap-3">
              {/* Views */}
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                {formatViews(media.views)}
              </span>

            </div>

            <span>{formatDate(media.createdAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
