'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'

interface CardData {
  id: string
  cardTitle: string | null
  ttsMessage: string | null
  senderName: string | null
  media: {
    id: string
    title: string
    type: string
    thumbnailUrl: string | null
    url: string
    processingStatus: string
    creatorUsername: string
    creatorName: string | null
  }
}

export default function CelebrationCardPage({ params }: { params: { cardId: string } }) {
  const [card, setCard] = useState<CardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/celebration-card/${params.cardId}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Card not found' : res.status === 410 ? 'This card has expired' : 'Failed to load')
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setCard(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load card')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [params.cardId])

  const playTts = () => {
    if (!card?.ttsMessage || typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(card.ttsMessage)
    u.lang = 'en-US'
    u.onstart = () => setTtsPlaying(true)
    u.onend = u.onerror = () => setTtsPlaying(false)
    utteranceRef.current = u
    window.speechSynthesis.speak(u)
  }

  const stopTts = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
      setTtsPlaying(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="text-gray-400 flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-tank-accent/30 border-t-tank-accent rounded-full animate-spin" />
          <span>Loading celebration card…</span>
        </div>
      </div>
    )
  }

  if (error || !card) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="text-center text-gray-400">
          <p className="text-lg">{error || 'Card not found'}</p>
          <Link href="/" className="mt-4 inline-block text-tank-accent hover:underline">
            Go to home
          </Link>
        </div>
      </div>
    )
  }

  const media = card.media
  const thumbSrc = media.thumbnailUrl || (media.type === 'IMAGE' ? media.url : null)
  const titleClean = media.title.replace(/#\w+/g, '').trim()

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="bg-tank-gray rounded-xl overflow-hidden border border-tank-light shadow-lg">
        <div className="p-6 pb-4">
          {card.senderName && (
            <p className="text-sm text-gray-500 mb-2">
              From <span className="text-gray-300">{card.senderName}</span>
            </p>
          )}
          {card.cardTitle && (
            <h1 className="text-xl font-bold text-white mb-4">{card.cardTitle}</h1>
          )}
        </div>

        {/* Tile: thumbnail + title + creator (homepage style) */}
        <div className="px-6 pb-4">
          <Link
            href={`/media/${media.id}`}
            className="block bg-tank-dark rounded-xl overflow-hidden border border-tank-light/50 hover:border-tank-accent/50 transition-all"
          >
            <div className="relative aspect-video bg-tank-dark">
              {thumbSrc ? (
                <img
                  src={thumbSrc}
                  alt={titleClean}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
                  <span className="text-white/60 text-4xl">
                    {media.type === 'VIDEO' ? '▶' : media.type === 'MUSIC' ? '♫' : '🖼'}
                  </span>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                <p className="font-semibold text-white truncate">{titleClean}</p>
                <p className="text-xs text-gray-300">by @{media.creatorUsername}</p>
              </div>
            </div>
          </Link>
          <Link
            href={`/media/${media.id}`}
            className="mt-3 inline-block text-sm text-tank-accent hover:underline"
          >
            View full media →
          </Link>
        </div>

        {/* TTS message */}
        {card.ttsMessage && (
          <div className="px-6 pb-6">
            <div className="bg-tank-dark/50 rounded-lg p-4 border border-tank-light/30">
              <p className="text-gray-300 text-sm mb-3 whitespace-pre-wrap">{card.ttsMessage}</p>
              <div className="flex items-center gap-2">
                {!ttsPlaying ? (
                  <button
                    type="button"
                    onClick={playTts}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-tank-accent text-tank-black font-medium text-sm hover:opacity-90"
                  >
                    <span>▶</span> Play message
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopTts}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 font-medium text-sm hover:bg-red-500/30"
                  >
                    <span>■</span> Stop
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-gray-500 text-sm mt-6">
        Celebration card from{' '}
        <Link href="/" className="text-tank-accent hover:underline">
          AI Media Tank (AiM)
        </Link>
      </p>
    </div>
  )
}
