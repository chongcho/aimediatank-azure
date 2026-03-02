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

const TITLE_OPTIONS = [
  'Celebrate Birthday!',
  'Celebrate Wedding!',
  'Celebrate Anniversary!',
  'Celebrate Graduation!',
  'Celebrate Promotion!',
]

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

  if (view === 'choice') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full space-y-4">
          <h1 className="text-2xl font-bold text-white text-center">Celebration Card</h1>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setView('new')}
              className="w-full px-6 py-4 rounded-xl font-semibold bg-tank-accent text-tank-black hover:opacity-90 transition-opacity"
            >
              New Celebration Card
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
            Create a celebration card with media and a message, or view cards you&apos;ve sent.
          </p>
        </div>
      </div>
    )
  }

  if (view === 'history') {
    return (
      <div className="min-h-[60vh] max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <button
            type="button"
            onClick={() => setView('choice')}
            className="text-gray-400 hover:text-white"
          >
            &larr; Back
          </button>
          <h1 className="text-xl font-bold text-white">Sent History</h1>
        </div>
        {historyLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-2 border-tank-accent/30 border-t-tank-accent rounded-full animate-spin" />
          </div>
        ) : sentCards.length === 0 ? (
          <p className="text-gray-400">No celebration cards sent yet.</p>
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
                    {card.recipientEmail || 'No email'} &middot; {new Date(card.createdAt).toLocaleDateString()}
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

  return (
    <CelebrationCardForm onBack={() => setView('choice')} senderName={session.user?.name || session.user?.username || 'User'} />
  )
}

function CelebrationCardForm({ onBack, senderName }: { onBack: () => void; senderName: string }) {
  const [deliveryMethod, setDeliveryMethod] = useState<'email' | 'phone'>('email')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [cardTitle, setCardTitle] = useState('')
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
      setResult({ cardUrl: data.cardUrl, emailSent: data.emailSent })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSending(false)
    }
  }

  if (result) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-8">
        <div className="max-w-md w-full rounded-2xl overflow-hidden shadow-2xl border border-[#1a5c66]">
          <div className="bg-[#1a6e7a] p-6 text-center">
            <svg className="w-12 h-12 mx-auto text-white/90 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-bold text-white">Card Sent!</h2>
          </div>
          <div className="bg-[#14555e] p-6 space-y-4">
            {result.emailSent && (
              <p className="text-sm text-green-300">Email sent to {recipientEmail}</p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={result.cardUrl}
                className="flex-1 px-3 py-2 rounded-lg bg-[#0f3f47] border border-[#1a6e7a] text-white text-sm truncate"
              />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(result.cardUrl)}
                className="px-4 py-2 rounded-lg bg-[#1a6e7a] text-white text-sm font-medium hover:bg-[#1f7f8c] shrink-0"
              >
                Copy
              </button>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="w-full py-3 rounded-xl font-semibold bg-[#1a6e7a] text-white hover:bg-[#1f7f8c] transition-colors"
            >
              Back to Celebration Card
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        {/* Back button */}
        <button
          type="button"
          onClick={onBack}
          className="text-gray-400 hover:text-white text-sm mb-4 inline-flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>

        {/* Card header */}
        <h1 className="text-lg font-bold text-white mb-4">Celebration Card</h1>

        <form onSubmit={handleSend} className="rounded-2xl overflow-hidden shadow-2xl border border-[#1a5c66]">
          {/* Send from */}
          <div className="bg-[#1a6e7a] px-5 py-4">
            <label className="text-sm font-semibold text-white/80 uppercase tracking-wide">Send from:</label>
            <p className="text-white font-medium mt-1">
              {senderName} <span className="text-white/60 text-sm">via Celebrate@aimediatank.com</span>
            </p>
          </div>

          {/* Send to */}
          <div className="bg-[#17626c] px-5 py-4 border-t border-[#1a5c66]">
            <label className="text-sm font-semibold text-white/80 uppercase tracking-wide">Send to:</label>
            <div className="flex gap-2 mt-2 mb-3">
              <button
                type="button"
                onClick={() => setDeliveryMethod('email')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  deliveryMethod === 'phone'
                    ? 'bg-white text-[#17626c]'
                    : 'bg-[#1a6e7a] text-white/70 hover:text-white'
                }`}
              >
                Phone
              </button>
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
          <div className="bg-[#1a6e7a] px-5 py-4 border-t border-[#1a5c66]">
            <label className="text-sm font-semibold text-white/80 uppercase tracking-wide">Title</label>
            <select
              value={cardTitle}
              onChange={(e) => setCardTitle(e.target.value)}
              className="w-full mt-2 px-4 py-2.5 rounded-lg bg-[#0f3f47] border border-[#1a6e7a] text-white text-sm focus:outline-none focus:border-white/50 appearance-none cursor-pointer"
            >
              <option value="" className="bg-[#0f3f47]">Select a title...</option>
              {TITLE_OPTIONS.map((t) => (
                <option key={t} value={t} className="bg-[#0f3f47]">{t}</option>
              ))}
            </select>
          </div>

          {/* Select media */}
          <div className="bg-[#17626c] px-5 py-4 border-t border-[#1a5c66]">
            <label className="text-sm font-semibold text-white/80 uppercase tracking-wide">Select media</label>
            <p className="text-xs text-white/50 mt-1 mb-3">Select media from AiMediaTank.com</p>
            {mediaLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                {mediaList.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMedia(m)}
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                      selectedMedia?.id === m.id
                        ? 'border-white ring-1 ring-white shadow-lg'
                        : 'border-transparent hover:border-white/30'
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
                <Link href={`/media/${selectedMedia.id}`} className="underline text-white/90" target="_blank">
                  View media
                </Link>
              </p>
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

          {/* Send button */}
          <button
            type="submit"
            disabled={sending || !selectedMedia}
            className="w-full bg-[#14555e] hover:bg-[#175f69] disabled:opacity-50 px-5 py-4 text-white font-bold text-lg transition-colors border-t border-[#1a5c66]"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}
