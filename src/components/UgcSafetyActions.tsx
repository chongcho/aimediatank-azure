'use client'

import { useCallback, useState } from 'react'
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

export function BlockUserButton({
  blockedUserId,
  blockedUsername,
  className = '',
  compact = false,
  onBlocked,
}: BlockUserButtonProps) {
  const [loading, setLoading] = useState(false)

  const block = async () => {
    const label = blockedUsername ? `@${blockedUsername}` : 'this user'
    if (
      !window.confirm(
        `Block ${label}? Their content will be hidden from your feed and chat immediately.`,
      )
    ) {
      return
    }
    setLoading(true)
    try {
      const res = await nativeFetch('/api/ugc/report', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockedUserId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        window.alert(typeof data.error === 'string' ? data.error : 'Could not block user')
        return
      }
      window.dispatchEvent(new CustomEvent('ugc-user-blocked', { detail: { blockedUserId } }))
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

export { REPORT_REASON_OPTIONS }
