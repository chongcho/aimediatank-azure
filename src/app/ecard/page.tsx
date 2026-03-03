'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { stripHashtags } from '@/lib/text'

interface MediaItem {
  id: string
  title: string
  type: string
  url: string
  streamUrl?: string
  thumbnailUrl: string | null
  user?: { username: string }
}

const TITLE_OPTIONS = [
  'Celebrate Birthday!',
  'Celebrate Wedding!',
  'Celebrate Anniversary!',
  'Celebrate Graduation!',
  'Celebrate Promotion!',
]

export default function EcardPage() {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="w-10 h-10 border-2 border-tank-accent/30 border-t-tank-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session?.user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-tank-dark/80 border border-tank-light rounded-2xl p-8 text-center space-y-6">
          <h1 className="text-2xl font-bold text-white">Celebration Card</h1>
          <p className="text-gray-300">Sign in to create and send celebration cards.</p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 bg-tank-accent hover:bg-tank-accent/90 text-white font-medium rounded-lg transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <CelebrationCardForm senderName={session.user?.name || session.user?.username || 'User'} />
  )
}

function CelebrationCardForm({ senderName }: { senderName: string }) {
  const [deliveryMethod, setDeliveryMethod] = useState<'email' | 'phone'>('email')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [cardTitle, setCardTitle] = useState('')
  const [mediaList, setMediaList] = useState<MediaItem[]>([])
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null)
  const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [mediaLoading, setMediaLoading] = useState(true)

  useEffect(() => {
    fetch('/api/media?limit=24&sort=recent')
      .then((res) => (res.ok ? res.json() : { media: [] }))
      .then((data) => setMediaList(data.media || []))
      .catch(() => setMediaList([]))
      .finally(() => setMediaLoading(false))
  }, [])

  const resetForm = useCallback(() => {
    setDeliveryMethod('email')
    setRecipientEmail('')
    setRecipientPhone('')
    setCardTitle('')
    setSelectedMedia(null)
    setMessage('')
    setError(null)
  }, [])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!selectedMedia) {
      setError('Please select a media')
      return
    }
    const email = deliveryMethod === 'email' ? recipientEmail.trim() : ''
    if (deliveryMethod === 'email' && !email) {
      setError('Email address is required')
      return
    }
    if (deliveryMethod === 'phone' && !recipientPhone.trim()) {
      setError('Phone number is required')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/celebration-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: selectedMedia.id,
          recipientEmail: email || undefined,
          cardTitle: cardTitle || undefined,
          ttsMessage: message.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create card')
      setToast(email ? `Card sent to ${email}` : 'Card created!')
      resetForm()
      setTimeout(() => setToast(null), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        <h1 className="text-lg font-bold text-white mb-4">Celebration Card</h1>

        {/* Success toast */}
        {toast && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-green-600 text-white text-sm font-medium flex items-center gap-2 animate-fade-in">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {toast}
          </div>
        )}

        <form onSubmit={handleSend} className="rounded-2xl overflow-hidden shadow-2xl border border-[#1a5c66]">
          {/* From */}
          <div className="bg-[#1a6e7a] px-5 py-3">
            <p className="text-white font-medium">
              <span className="text-sm font-semibold text-white/80 uppercase tracking-wide">From: </span>
              {senderName} <span className="text-white/60 text-sm">via Celebrate@aimediatank.com</span>
            </p>
          </div>

          {/* To */}
          <div className="bg-[#17626c] px-5 py-3 border-t border-[#1a5c66]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-white/80 uppercase tracking-wide shrink-0">To:</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setDeliveryMethod('email')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    deliveryMethod === 'email'
                      ? 'bg-white text-[#17626c]'
                      : 'bg-[#1a6e7a] text-white/70 hover:text-white'
                  }`}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryMethod('phone')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    deliveryMethod === 'phone'
                      ? 'bg-white text-[#17626c]'
                      : 'bg-[#1a6e7a] text-white/70 hover:text-white'
                  }`}
                >
                  Phone
                </button>
              </div>
            </div>
            {deliveryMethod === 'email' ? (
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="Type Email Address"
                className="w-full px-4 py-2.5 rounded-lg bg-[#0f3f47] border border-[#1a6e7a] text-white placeholder-white/40 text-sm focus:outline-none focus:border-white/50"
              />
            ) : (
              <input
                type="tel"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="Type Phone Number"
                className="w-full px-4 py-2.5 rounded-lg bg-[#0f3f47] border border-[#1a6e7a] text-white placeholder-white/40 text-sm focus:outline-none focus:border-white/50"
              />
            )}
          </div>

          {/* Title */}
          <div className="bg-[#1a6e7a] px-5 py-3 border-t border-[#1a5c66]">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white/80 uppercase tracking-wide shrink-0">Title:</span>
              <select
                value={TITLE_OPTIONS.includes(cardTitle) || cardTitle === '' ? cardTitle : '__other__'}
                onChange={(e) => {
                  if (e.target.value === '__other__') {
                    setCardTitle(' ')
                  } else {
                    setCardTitle(e.target.value)
                  }
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-[#0f3f47] border border-[#1a6e7a] text-white text-sm focus:outline-none focus:border-white/50 appearance-none cursor-pointer"
              >
                <option value="" className="bg-[#0f3f47]">Select a title...</option>
                {TITLE_OPTIONS.map((t) => (
                  <option key={t} value={t} className="bg-[#0f3f47]">{t}</option>
                ))}
                <option value="__other__" className="bg-[#0f3f47]">Other...</option>
              </select>
            </div>
            {!TITLE_OPTIONS.includes(cardTitle) && cardTitle !== '' && (
              <input
                type="text"
                value={cardTitle.trim() === '' ? '' : cardTitle}
                onChange={(e) => setCardTitle(e.target.value)}
                placeholder="Type your custom title"
                autoFocus
                className="w-full mt-2 px-3 py-2 rounded-lg bg-[#0f3f47] border border-[#1a6e7a] text-white placeholder-white/40 text-sm focus:outline-none focus:border-white/50"
              />
            )}
          </div>

          {/* Select media */}
          <div className="bg-[#17626c] px-5 py-4 border-t border-[#1a5c66]">
            <label className="text-sm font-semibold text-white/80 uppercase tracking-wide">Select media</label>
            {mediaLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-0.5 max-h-48 overflow-y-auto pr-1 mt-2">
                {mediaList.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMedia(m)}
                    className={`relative aspect-video overflow-hidden border transition-all ${
                      selectedMedia?.id === m.id
                        ? 'border-white ring-1 ring-white shadow-lg'
                        : 'border-[#1a5c66]/50 hover:border-white/30'
                    }`}
                  >
                    {m.thumbnailUrl ? (
                      <img
                        src={m.thumbnailUrl}
                        alt={stripHashtags(m.title)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#0f3f47] flex items-center justify-center">
                        <span className="text-white/30 text-xs">No thumb</span>
                      </div>
                    )}
                    {selectedMedia?.id === m.id && (
                      <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center text-[#17626c] text-xs font-bold">
                        &#10003;
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {selectedMedia && (
              <p className="text-xs text-white/70 mt-2">
                Selected: {stripHashtags(selectedMedia.title)} &middot;{' '}
                <button type="button" onClick={() => setPreviewMedia(selectedMedia)} className="underline text-white/90 hover:text-white">
                  View media
                </button>
              </p>
            )}
            {/* Inline media preview */}
            {previewMedia && (
              <div className="mt-2 relative rounded-lg overflow-hidden border border-white/20 bg-black">
                <button
                  type="button"
                  onClick={() => setPreviewMedia(null)}
                  className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center text-sm hover:bg-black"
                >
                  &times;
                </button>
                {previewMedia.type === 'VIDEO' ? (
                  <video
                    src={previewMedia.streamUrl ?? previewMedia.url}
                    poster={previewMedia.thumbnailUrl || undefined}
                    className="w-full max-h-64 object-contain"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                  />
                ) : previewMedia.thumbnailUrl ? (
                  <img
                    src={previewMedia.thumbnailUrl}
                    alt={stripHashtags(previewMedia.title)}
                    className="w-full max-h-64 object-contain"
                  />
                ) : (
                  <div className="w-full h-40 flex items-center justify-center text-white/40 text-sm">No preview available</div>
                )}
              </div>
            )}
          </div>

          {/* Type Message */}
          <div className="bg-[#1a6e7a] px-5 py-4 border-t border-[#1a5c66]">
            <label className="text-sm font-semibold text-white/80 uppercase tracking-wide">
              Type Message <span className="text-white/40 font-normal normal-case">(optional)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type personal messages"
              rows={3}
              className="w-full mt-2 px-4 py-2.5 rounded-lg bg-[#0f3f47] border border-[#1a6e7a] text-white placeholder-white/40 text-sm focus:outline-none focus:border-white/50 resize-y"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/20 px-5 py-2 border-t border-red-500/30">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Cancel / Send buttons */}
          <div className="flex border-t border-[#1a5c66]">
            <button
              type="button"
              onClick={resetForm}
              className="flex-1 bg-[#14555e] hover:bg-[#175f69] px-5 py-4 text-white/70 hover:text-white font-bold text-lg transition-colors border-r border-[#1a5c66]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !selectedMedia}
              className="flex-1 bg-[#14555e] hover:bg-[#175f69] disabled:opacity-50 px-5 py-4 text-white font-bold text-lg transition-colors"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>

        {/* Back button */}
        <button
          type="button"
          onClick={() => window.history.back()}
          className="mt-4 px-5 py-2.5 bg-gray-600/80 hover:bg-gray-500/80 text-white text-sm font-medium rounded-lg transition-colors"
        >
          &larr; Back
        </button>
      </div>
    </div>
  )
}
