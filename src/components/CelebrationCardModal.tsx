'use client'

import { useState } from 'react'
import AppModalOverlay, {
  APP_MODAL_DRAG_HEADER_ROW_CLASS,
  APP_MODAL_PANEL_CLASS,
} from '@/components/AppModalOverlay'

interface CelebrationCardModalProps {
  mediaId: string
  mediaTitle: string
  onClose: () => void
}

const SNS_LINKS = (cardUrl: string, message: string) => {
  const encodedUrl = encodeURIComponent(cardUrl)
  const encodedText = encodeURIComponent(message || 'Check out this celebration card!')
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
  }
}

export default function CelebrationCardModal({ mediaId, mediaTitle, onClose }: CelebrationCardModalProps) {
  const [recipientEmail, setRecipientEmail] = useState('')
  const [cardTitle, setCardTitle] = useState('')
  const [ttsMessage, setTtsMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ cardUrl: string; emailSent: boolean } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSending(true)
    try {
      const res = await fetch('/api/celebration-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId,
          recipientEmail: recipientEmail.trim() || undefined,
          cardTitle: cardTitle.trim() || undefined,
          ttsMessage: ttsMessage.trim() || undefined,
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

  const copyLink = () => {
    if (!result?.cardUrl) return
    navigator.clipboard.writeText(result.cardUrl)
  }

  const shareNative = () => {
    if (!result?.cardUrl) return
    const text = ttsMessage.trim() || 'Check out this celebration card!'
    if (navigator.share) {
      navigator.share({
        title: cardTitle.trim() || 'Celebration card',
        text,
        url: result.cardUrl,
      }).catch(() => {})
    }
  }

  const openSns = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500')
  }

  const sns = result ? SNS_LINKS(result.cardUrl, ttsMessage.trim() || cardTitle.trim() || 'Check out this celebration card!') : null

  return (
    <AppModalOverlay open onClose={onClose}>
      <div className={`card relative w-full max-w-md max-h-[min(90vh,720px)] overflow-y-auto shadow-2xl rounded-2xl ${APP_MODAL_PANEL_CLASS}`}>
        <div
          className={APP_MODAL_DRAG_HEADER_ROW_CLASS}
          data-app-modal-drag-handle
        >
          <h3 className="text-lg font-semibold text-white">Send celebration card</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-600/80 hover:bg-gray-500/80 text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Share this media as an e-card with an optional personal message (read aloud on the card page). Send by email and/or share the link on social.
        </p>

        {!result ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Recipient email (optional)</label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="friend@example.com"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Card title (optional)</label>
              <input
                type="text"
                value={cardTitle}
                onChange={(e) => setCardTitle(e.target.value)}
                placeholder="e.g. Happy Birthday!"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Personal message (optional, read aloud on card)</label>
              <textarea
                value={ttsMessage}
                onChange={(e) => setTtsMessage(e.target.value)}
                placeholder="Add a message that will be read aloud when they open the card..."
                rows={3}
                className="input w-full resize-y"
              />
            </div>
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending}
                className="flex-1 px-4 py-2 rounded-xl font-semibold bg-tank-accent text-tank-black hover:opacity-90 disabled:opacity-50"
              >
                {sending ? 'Creating…' : 'Create & send'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {result.emailSent && (
              <p className="text-sm text-green-400">Card sent by email to {recipientEmail || 'recipient'}.</p>
            )}
            <p className="text-sm text-gray-300">Your celebration card link:</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={result.cardUrl}
                className="input flex-1 text-sm truncate"
              />
              <button
                type="button"
                onClick={copyLink}
                className="px-3 py-2 rounded-lg bg-tank-gray border border-tank-light text-white text-sm font-medium hover:bg-tank-light shrink-0"
              >
                Copy
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button
                  type="button"
                  onClick={shareNative}
                  className="px-3 py-2 rounded-lg bg-tank-accent text-tank-black text-sm font-medium hover:opacity-90"
                >
                  Share (app)
                </button>
              )}
              {sns && (
                <>
                  <button type="button" onClick={() => openSns(sns.facebook)} className="px-3 py-2 rounded-lg bg-[#1877F2]/80 text-white text-sm hover:opacity-90">
                    Facebook
                  </button>
                  <button type="button" onClick={() => openSns(sns.twitter)} className="px-3 py-2 rounded-lg bg-black text-white text-sm hover:opacity-90">
                    X
                  </button>
                  <button type="button" onClick={() => openSns(sns.whatsapp)} className="px-3 py-2 rounded-lg bg-[#25D366]/90 text-white text-sm hover:opacity-90">
                    WhatsApp
                  </button>
                  <button type="button" onClick={() => openSns(sns.linkedin)} className="px-3 py-2 rounded-lg bg-[#0A66C2]/90 text-white text-sm hover:opacity-90">
                    LinkedIn
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full btn-secondary"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </AppModalOverlay>
  )
}
