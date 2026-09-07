'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { nativeFetch } from '@/lib/iosAppStoreCompliance'

export type UgcReportType = 'MEDIA' | 'USER' | 'CHAT_MESSAGE'

const REPORT_REASON_OPTIONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'nudity', label: 'Nudity or sexual content' },
  { value: 'violence', label: 'Violence or dangerous content' },
  { value: 'copyright', label: 'Copyright violation' },
  { value: 'other', label: 'Other' },
] as const

type ReportModalProps = {
  open: boolean
  onClose: () => void
  reportType: UgcReportType
  mediaId?: string
  reportedUserId?: string
  chatMessageId?: string
  subjectLabel?: string
  onReported?: () => void
}

export function UgcReportModal({
  open,
  onClose,
  reportType,
  mediaId,
  reportedUserId,
  chatMessageId,
  subjectLabel,
  onReported,
}: ReportModalProps) {
  const [reason, setReason] = useState('spam')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = useCallback(async () => {
    setSubmitting(true)
    setError('')
    try {
      const res = await nativeFetch('/api/ugc/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType,
          reason,
          details: details.trim() || undefined,
          mediaId,
          reportedUserId,
          chatMessageId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not submit report')
        return
      }
      onReported?.()
      onClose()
      setDetails('')
      setReason('spam')
    } catch {
      setError('Could not submit report')
    } finally {
      setSubmitting(false)
    }
  }, [
    chatMessageId,
    details,
    mediaId,
    onClose,
    onReported,
    reason,
    reportType,
    reportedUserId,
  ])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      onClick={() => !submitting && onClose()}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-tank-light bg-tank-dark p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ugc-report-title"
      >
        <h3 id="ugc-report-title" className="mb-1 text-lg font-bold text-white">
          Report content
        </h3>
        {subjectLabel ? <p className="mb-3 text-sm text-gray-400">{subjectLabel}</p> : null}

        <label className="mb-1 block text-sm text-gray-300" htmlFor="ugc-report-reason">
          Reason
        </label>
        <select
          id="ugc-report-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mb-3 w-full rounded-lg border border-tank-light bg-tank-gray px-3 py-2 text-sm text-white"
        >
          {REPORT_REASON_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm text-gray-300" htmlFor="ugc-report-details">
          Details (optional)
        </label>
        <textarea
          id="ugc-report-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          className="mb-3 w-full rounded-lg border border-tank-light bg-tank-gray px-3 py-2 text-sm text-white"
          placeholder="Tell us what is wrong with this content"
        />

        {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg bg-tank-gray px-4 py-2 text-sm text-gray-300 hover:bg-tank-light"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit report'}
          </button>
        </div>
      </div>
    </div>
  )
}

type BlockUserButtonProps = {
  blockedUserId: string
  blockedUsername?: string | null
  className?: string
  compact?: boolean
  onBlocked?: () => void
}

async function blockUserForViewer(opts: {
  blockedUserId: string
  blockedUsername?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const label = opts.blockedUsername ? `@${opts.blockedUsername}` : 'this user'
  if (
    !window.confirm(
      `Block ${label}?\n\nOnly you will stop seeing their content in your feed and chat. Other users and the app’s public content are not changed.`,
    )
  ) {
    return { ok: false }
  }
  const res = await nativeFetch('/api/ugc/report', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blockedUserId: opts.blockedUserId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      ok: false,
      error: typeof data.error === 'string' ? data.error : 'Could not block user',
    }
  }
  window.dispatchEvent(
    new CustomEvent('ugc-user-blocked', { detail: { blockedUserId: opts.blockedUserId } }),
  )
  return { ok: true }
}

export function BlockUserButton({
  blockedUserId,
  blockedUsername,
  className = '',
  compact = false,
  onBlocked,
}: BlockUserButtonProps) {
  const [loading, setLoading] = useState(false)

  const block = async () => {
    setLoading(true)
    try {
      const result = await blockUserForViewer({ blockedUserId, blockedUsername })
      if (!result.ok) {
        if (result.error) window.alert(result.error)
        return
      }
      onBlocked?.()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void block()}
      disabled={loading}
      className={
        className ||
        (compact
          ? 'text-xs px-2 py-1 rounded border border-red-700/40 text-red-300 hover:bg-red-950/40 disabled:opacity-50'
          : 'rounded-lg border border-red-700/50 bg-red-950/30 px-3 py-2 text-sm text-red-200 hover:bg-red-900/40 disabled:opacity-50')
      }
    >
      {loading ? 'Blocking…' : 'Block user'}
    </button>
  )
}

async function blockContentForViewer(opts: {
  mediaId: string
}): Promise<{ ok: boolean; error?: string }> {
  if (
    !window.confirm(
      'Block this content?\n\nOnly you will stop seeing this item in your feed. Other posts from the same creator stay visible. Other users are not affected.',
    )
  ) {
    return { ok: false }
  }
  const res = await nativeFetch('/api/ugc/report', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaId: opts.mediaId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      ok: false,
      error: typeof data.error === 'string' ? data.error : 'Could not block content',
    }
  }
  window.dispatchEvent(
    new CustomEvent('ugc-media-blocked', { detail: { mediaId: opts.mediaId } }),
  )
  return { ok: true }
}

/** Red flag next to creator; Save / Report / Block content (this media only). */
type UgcCreatorSafetyMenuProps = {
  mediaId: string
  onReport: () => void
  onBlocked?: () => void
  onSave?: () => void
  isSaved?: boolean
  saving?: boolean
  saveLabel?: string
  savedLabel?: string
  /** When false, only Save is shown (e.g. own content). Default true. */
  showSafetyActions?: boolean
}

export function UgcCreatorSafetyMenu({
  mediaId,
  onReport,
  onBlocked,
  onSave,
  isSaved = false,
  saving = false,
  saveLabel = 'Save to My Contents',
  savedLabel = 'Saved to My Contents',
  showSafetyActions = true,
}: UgcCreatorSafetyMenuProps) {
  const [open, setOpen] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (target && rootRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleBlock = async () => {
    setBlocking(true)
    try {
      const result = await blockContentForViewer({ mediaId })
      if (!result.ok) {
        if (result.error) window.alert(result.error)
        return
      }
      setOpen(false)
      onBlocked?.()
    } finally {
      setBlocking(false)
    }
  }

  return (
    <span ref={rootRef} className="relative inline-flex items-center align-middle">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="ml-1.5 inline-flex h-6 w-6 items-center justify-center rounded text-red-500 hover:bg-red-950/50 hover:text-red-400 transition-colors"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="More actions"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M4 3h2v18H4V3zm3 1h9.2c.7 0 1.1.8.7 1.4L15.5 9l1.4 3.6c.4.6 0 1.4-.7 1.4H7V4z" />
        </svg>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-full z-40 mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-tank-light bg-tank-dark shadow-xl"
        >
          {onSave ? (
            <button
              type="button"
              role="menuitem"
              disabled={saving}
              className="block w-full px-3 py-2.5 text-left text-sm text-gray-200 hover:bg-tank-light/40 disabled:opacity-50"
              onClick={() => {
                setOpen(false)
                onSave()
              }}
            >
              {saving ? 'Saving…' : isSaved ? savedLabel : saveLabel}
            </button>
          ) : null}
          {showSafetyActions ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2.5 text-left text-sm text-gray-200 hover:bg-tank-light/40"
                onClick={() => {
                  setOpen(false)
                  onReport()
                }}
              >
                Report content
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={blocking}
                className="block w-full px-3 py-2.5 text-left text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                onClick={() => void handleBlock()}
              >
                {blocking ? 'Blocking…' : 'Block content'}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </span>
  )
}

export { REPORT_REASON_OPTIONS }
