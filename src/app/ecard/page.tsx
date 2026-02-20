'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { stripHashtags } from '@/lib/text'

type View = 'choice' | 'new' | 'history'

interface MediaItem {
  id: string
  title: string
  type: string
  thumbnailUrl: string | null
  user?: { username: string }
}

interface SentCard {
  id: string
  cardUrl: string
  recipientEmail: string | null
  cardTitle: string | null
  ttsMessage: string | null
  createdAt: string
  media: { id: string; title: string; type: string; thumbnailUrl: string | null } | null
}

export default function EcardPage() {
  const { data: session, status } = useSession()
  const [view, setView] = useState<View>('choice')
  const [sentCards, setSentCards] = useState<SentCard[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    if (view === 'history' && session?.user) {
      setHistoryLoading(true)
      fetch('/api/celebration-card')
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setSentCards(Array.isArray(data) ? data : []))
        .catch(() => setSentCards([]))
        .finally(() => setHistoryLoading(false))
    }
  }, [view, session?.user])

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
          <h1 className="text-2xl font-bold text-white">eCard</h1>
          <p className="text-gray-300">Sign in to create and send eCards.</p>
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

  // Step 2: New eCard | Sent History
  if (view === 'choice') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full space-y-4">
          <h1 className="text-2xl font-bold text-white text-center">eCard</h1>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setView('new')}
              className="w-full px-6 py-4 rounded-xl font-semibold bg-tank-accent text-tank-black hover:opacity-90 transition-opacity"
            >
              New eCard
            </button>
            <button
              type="button"
              onClick={() => setView('history')}
              className="w-full px-6 py-4 rounded-xl font-semibold bg-tank-gray border border-tank-light text-white hover:bg-tank-light transition-colors"
            >
              Sent History
            </button>
          </div>
          <p className="text-center text-gray-400 text-sm">
            Create a card with media and a message, or view cards you’ve sent.
          </p>
        </div>
      </div>
    )
  }

  // Sent History
  if (view === 'history') {
    return (
      <div className="min-h-[60vh] max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <button
            type="button"
            onClick={() => setView('choice')}
            className="text-gray-400 hover:text-white"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-white">Sent History</h1>
        </div>
        {historyLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-2 border-tank-accent/30 border-t-tank-accent rounded-full animate-spin" />
          </div>
        ) : sentCards.length === 0 ? (
          <p className="text-gray-400">No eCards sent yet. Create one from New eCard.</p>
        ) : (
          <ul className="space-y-4">
            {sentCards.map((card) => (
              <li
                key={card.id}
                className="flex items-center gap-4 p-4 rounded-xl bg-tank-dark border border-tank-light"
              >
                {card.media?.thumbnailUrl ? (
                  <img
                    src={card.media.thumbnailUrl}
                    alt=""
                    className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-tank-light flex-shrink-0 flex items-center justify-center">
                    <span className="text-gray-500 text-xs">No thumb</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-white font-medium truncate">{card.media?.title ? stripHashtags(card.media.title) : 'Card'}</p>
                  <p className="text-gray-400 text-sm">
                    {card.recipientEmail || 'No email'} · {new Date(card.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <a
                    href={card.cardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-tank-accent text-tank-black text-sm font-medium hover:opacity-90"
                  >
                    View
                  </a>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(card.cardUrl)}
                    className="px-3 py-1.5 rounded-lg bg-tank-gray border border-tank-light text-white text-sm hover:bg-tank-light"
                  >
                    Copy link
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // New eCard → eCard Tool
  return (
    <EcardTool onBack={() => setView('choice')} />
  )
}

function EcardTool({ onBack }: { onBack: () => void }) {
  const [recipientEmail, setRecipientEmail] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [mediaList, setMediaList] = useState<MediaItem[]>([])
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ cardUrl: string; emailSent: boolean } | null>(null)
  const [mediaLoading, setMediaLoading] = useState(true)

  useEffect(() => {
    fetch('/api/media?limit=24&sort=recent')
      .then((res) => (res.ok ? res.json() : { media: [] }))
      .then((data) => setMediaList(data.media || []))
      .catch(() => setMediaList([]))
      .finally(() => setMediaLoading(false))
  }, [])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!selectedMedia) {
      setError('Please choose a media')
      return
    }
    const email = recipientEmail.trim()
    if (!email) {
      setError('Email address is required')
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
          ttsMessage: message.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create card')
      setResult({ cardUrl: data.cardUrl, emailSent: data.emailSent })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSending(false)
    }
  }

  if (result) {
    return (
      <div className="min-h-[60vh] max-w-md mx-auto px-4 py-8">
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">eCard sent</h2>
          {result.emailSent && (
            <p className="text-sm text-green-400">Card sent by email to {recipientEmail}.</p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={result.cardUrl}
              className="input flex-1 text-sm truncate"
            />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(result.cardUrl)}
              className="px-3 py-2 rounded-lg bg-tank-gray border border-tank-light text-white text-sm font-medium shrink-0"
            >
              Copy
            </button>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="w-full btn-secondary"
          >
            Back to eCard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[60vh] max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="text-gray-400 hover:text-white"
        >
          ← Back
        </button>
        <h1 className="text-xl font-bold text-white">New eCard</h1>
      </div>

      <form onSubmit={handleSend} className="card p-6 space-y-6">
        {/* Email Address / Phone Number */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Email address</label>
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="friend@example.com"
            className="input w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Phone number (optional)</label>
          <input
            type="tel"
            value={recipientPhone}
            onChange={(e) => setRecipientPhone(e.target.value)}
            placeholder="+1 234 567 8900"
            className="input w-full"
          />
        </div>

        {/* Choose Media - Open Media Thumbnail with hyperlink */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Choose media</label>
          <p className="text-xs text-gray-400 mb-2">Click a thumbnail to select it for the card. Thumbnails link to the media page.</p>
          {mediaLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-tank-accent/30 border-t-tank-accent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {mediaList.map((m) => (
                <div key={m.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setSelectedMedia(m)}
                    className={`w-full aspect-video rounded-lg overflow-hidden block text-left border-2 ${selectedMedia?.id === m.id ? 'ring-2 ring-tank-accent ring-offset-2 ring-offset-tank-dark border-tank-accent' : 'border-transparent'}`}
                  >
                    {m.thumbnailUrl ? (
                      <img
                        src={m.thumbnailUrl}
                        alt={stripHashtags(m.title)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-tank-light flex items-center justify-center">
                        <span className="text-gray-500 text-xs">No thumb</span>
                      </div>
                    )}
                  </button>
                  <p className="text-xs text-gray-400 truncate mt-1" title={stripHashtags(m.title)}>
                    {stripHashtags(m.title)}
                  </p>
                  <Link
                    href={`/media/${m.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-tank-accent hover:underline"
                  >
                    Open media
                  </Link>
                  {selectedMedia?.id === m.id && (
                    <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-tank-accent flex items-center justify-center text-tank-black text-xs font-bold">✓</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {selectedMedia && (
            <p className="text-sm text-tank-accent mt-2">
              Selected: {stripHashtags(selectedMedia.title)} · <Link href={`/media/${selectedMedia.id}`} className="underline" target="_blank">Open media</Link>
            </p>
          )}
        </div>

        {/* Message Input */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Message (optional)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a personal message (read aloud on the card)..."
            rows={3}
            className="input w-full resize-y"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending || !selectedMedia}
            className="flex-1 px-4 py-3 rounded-xl font-semibold bg-tank-accent text-tank-black hover:opacity-90 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  )
}
