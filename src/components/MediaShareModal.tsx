'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppModalOverlay, {
  APP_MODAL_DRAG_HEADER_ROW_CLASS,
  APP_MODAL_PANEL_CLASS,
} from '@/components/AppModalOverlay'
import { useKakaoJsKey } from '@/components/KakaoConfigProvider'
import { useFeedCardTextMode } from '@/contexts/FeedCardTextModeContext'
import { useAutoTranslationEnabled } from '@/hooks/useAutoTranslationEnabled'
import { useGuestFeedLocalTargets } from '@/hooks/useGuestFeedLocalTargets'
import { useUiLocale } from '@/hooks/useUiLocale'
import { mediaPageInterpolate, mediaPageT, type MediaPageKey } from '@/messages/mediaPage'

const KAKAO_SHARE_TEXT_MAX = 200
/** Feed cards truncate description in KakaoTalk; use text template above this length. */
const KAKAO_FEED_TEXT_MAX = 100

function buildKakaoSharePayload(
  title: string,
  message: string,
  shareUrl: string,
  imageUrl: string | null | undefined,
  fallbackTitle: string
) {
  const trimmedTitle = title.trim() || fallbackTitle
  const trimmedMessage = message.trim() || trimmedTitle
  const link = { mobileWebUrl: shareUrl, webUrl: shareUrl }
  const combined =
    trimmedMessage !== trimmedTitle && trimmedTitle
      ? `${trimmedTitle}\n\n${trimmedMessage}`
      : trimmedMessage || trimmedTitle
  const text = combined.slice(0, KAKAO_SHARE_TEXT_MAX)
  const secureImage = imageUrl && imageUrl.startsWith('https://') ? imageUrl : undefined

  if (text.length <= KAKAO_FEED_TEXT_MAX && secureImage) {
    return {
      objectType: 'feed' as const,
      content: {
        title: trimmedTitle.slice(0, 80),
        description: trimmedMessage.slice(0, KAKAO_SHARE_TEXT_MAX),
        imageUrl: secureImage,
        link,
      },
    }
  }

  return {
    objectType: 'text' as const,
    text,
    link,
  }
}

export type MediaShareModalProps = {
  open: boolean
  onClose: () => void
  mediaId: string
  shareTitle: string
  shareDescription?: string | null
  thumbnailUrl?: string | null
  shareAppsEnabled: Record<string, boolean>
  /** When set, detail-page Share button can show "Copied" after copy from modal. */
  onCopyStatusChange?: (status: 'idle' | 'copied') => void
}

export default function MediaShareModal({
  open,
  onClose,
  mediaId,
  shareTitle,
  shareDescription = null,
  thumbnailUrl = null,
  shareAppsEnabled,
  onCopyStatusChange,
}: MediaShareModalProps) {
  const { localeTag } = useUiLocale()
  const autoTranslationEnabled = useAutoTranslationEnabled()
  const { mode: feedCardTextMode } = useFeedCardTextMode()
  const { bundledTag } = useGuestFeedLocalTargets(autoTranslationEnabled)
  const chromeLocaleTag = useMemo(() => {
    if (!autoTranslationEnabled) return localeTag
    return feedCardTextMode === 'original' ? 'en' : bundledTag
  }, [autoTranslationEnabled, bundledTag, feedCardTextMode, localeTag])
  const tMedia = useCallback(
    (key: MediaPageKey) => mediaPageT(chromeLocaleTag, key),
    [chromeLocaleTag]
  )
  const kakaoJsKey = useKakaoJsKey()
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle')
  const [kakaoNotice, setKakaoNotice] = useState<string | null>(null)
  const [kakaoComposeOpen, setKakaoComposeOpen] = useState(false)
  const [kakaoTitle, setKakaoTitle] = useState('')
  const [kakaoMessage, setKakaoMessage] = useState('')

  useEffect(() => {
    if (open) {
      setKakaoNotice(null)
      setKakaoComposeOpen(false)
    }
  }, [open])

  useEffect(() => {
    if (kakaoComposeOpen) {
      setKakaoTitle(shareTitle)
      setKakaoMessage(shareDescription?.trim() || shareTitle)
    }
  }, [kakaoComposeOpen, shareTitle, shareDescription])

  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/media/${mediaId}` : ''

  const setCopied = useCallback(
    (copied: boolean) => {
      const status = copied ? 'copied' : 'idle'
      setShareStatus(status)
      onCopyStatusChange?.(status)
      if (copied) {
        setTimeout(() => {
          setShareStatus('idle')
          onCopyStatusChange?.('idle')
        }, 2000)
      }
    },
    [onCopyStatusChange]
  )

  const recordShareAction = useCallback(() => {
    fetch(`/api/media/${mediaId}/share`, { method: 'POST' }).catch(() => {})
  }, [mediaId])

  const handleCopyLink = useCallback(async (): Promise<boolean> => {
    if (!shareUrl) return false
    try {
      await navigator.clipboard.writeText(shareUrl)
      recordShareAction()
      setCopied(true)
      return true
    } catch {
      window.prompt('Copy this link:', shareUrl)
      return false
    }
  }, [shareUrl, recordShareAction, setCopied])

  const sendKakaoShare = useCallback(
    (title: string, description: string) => {
      if (!shareUrl) return
      const w = typeof window !== 'undefined' ? window : null
      type KakaoWindow = {
        Kakao?: {
          isInitialized?: () => boolean
          Share?: { sendDefault: (opts: unknown) => void }
        }
      }
      const Kakao = w && (w as unknown as KakaoWindow).Kakao
      const shareApi = Kakao?.Share
      const runKakaoCopyFallback = async (message: string) => {
        const recorded = await handleCopyLink()
        if (!recorded) recordShareAction()
        setKakaoNotice(message)
      }
      if (!shareApi?.sendDefault) {
        void runKakaoCopyFallback(tMedia('kakaoSdkUnavailable'))
        return
      }
      if (typeof Kakao?.isInitialized === 'function' && !Kakao.isInitialized()) {
        void runKakaoCopyFallback(tMedia('kakaoSdkUnavailable'))
        return
      }
      const trimmedTitle = title.trim() || shareTitle
      const trimmedMessage = description.trim() || trimmedTitle
      try {
        shareApi.sendDefault(
          buildKakaoSharePayload(trimmedTitle, trimmedMessage, shareUrl, thumbnailUrl, shareTitle)
        )
        recordShareAction()
        onClose()
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[Kakao.Share.sendDefault]', err)
        void runKakaoCopyFallback(tMedia('kakaoShareFailed'))
      }
    },
    [
      shareUrl,
      shareTitle,
      thumbnailUrl,
      tMedia,
      handleCopyLink,
      recordShareAction,
      onClose,
    ]
  )

  const handleKakaoShare = useCallback(() => {
    if (!shareUrl) return
    setKakaoNotice(null)
    if (!kakaoJsKey) {
      void (async () => {
        const recorded = await handleCopyLink()
        if (!recorded) recordShareAction()
        setKakaoNotice(tMedia('kakaoNotConfigured'))
      })()
      return
    }
    const w = typeof window !== 'undefined' ? window : null
    type KakaoWindow = {
      Kakao?: {
        isInitialized?: () => boolean
        Share?: { sendDefault: (opts: unknown) => void }
      }
    }
    const Kakao = w && (w as unknown as KakaoWindow).Kakao
    const shareApi = Kakao?.Share
    if (!shareApi?.sendDefault) {
      void (async () => {
        const recorded = await handleCopyLink()
        if (!recorded) recordShareAction()
        setKakaoNotice(tMedia('kakaoSdkUnavailable'))
      })()
      return
    }
    if (typeof Kakao?.isInitialized === 'function' && !Kakao.isInitialized()) {
      void (async () => {
        const recorded = await handleCopyLink()
        if (!recorded) recordShareAction()
        setKakaoNotice(tMedia('kakaoSdkUnavailable'))
      })()
      return
    }
    setKakaoComposeOpen(true)
  }, [shareUrl, kakaoJsKey, tMedia, handleCopyLink, recordShareAction])

  const handleKakaoComposeSend = useCallback(() => {
    sendKakaoShare(kakaoTitle, kakaoMessage)
  }, [sendKakaoShare, kakaoTitle, kakaoMessage])

  const handleInstagramShare = useCallback(async () => {
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
        onClose()
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    const intent = `https://www.threads.net/intent/post?text=${encodeURIComponent(body)}`
    window.open(intent, '_blank', 'noopener,noreferrer')
    recordShareAction()
  }, [shareUrl, shareTitle, recordShareAction, onClose])

  const handleTikTokShare = useCallback(async () => {
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
        onClose()
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    void handleCopyLink().then((copied) => {
      if (!copied) recordShareAction()
    })
    window.open('https://www.tiktok.com/upload', '_blank', 'noopener,noreferrer')
  }, [shareUrl, shareTitle, handleCopyLink, recordShareAction, onClose])

  const handleYouTubeShare = useCallback(async () => {
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
        onClose()
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    void handleCopyLink().then((copied) => {
      if (!copied) recordShareAction()
    })
    window.open('https://studio.youtube.com/', '_blank', 'noopener,noreferrer')
  }, [shareUrl, shareTitle, handleCopyLink, recordShareAction, onClose])

  const mailBody = useMemo(() => {
    if (thumbnailUrl) return `${shareTitle}\n\n${thumbnailUrl}\n\n${shareUrl}`
    return shareUrl
  }, [shareTitle, thumbnailUrl, shareUrl])

  const kakaoCombinedCharCount = useMemo(() => {
    const trimmedTitle = kakaoTitle.trim()
    const trimmedMessage = kakaoMessage.trim()
    const combined =
      trimmedMessage !== trimmedTitle && trimmedTitle
        ? `${trimmedTitle}\n\n${trimmedMessage}`
        : trimmedMessage || trimmedTitle
    return combined.length
  }, [kakaoTitle, kakaoMessage])

  const kakaoShareOverLimit = kakaoCombinedCharCount > KAKAO_SHARE_TEXT_MAX

  if (!open) return null

  return (
    <AppModalOverlay
      open={open}
      onClose={onClose}
      dialogProps={{
        'aria-labelledby': 'media-share-modal-title',
      }}
    >
      <div className={`card relative w-full max-w-md max-h-[min(90vh,720px)] overflow-y-auto overscroll-contain shadow-2xl rounded-2xl ${APP_MODAL_PANEL_CLASS}`}>
        <div
          className={APP_MODAL_DRAG_HEADER_ROW_CLASS}
          data-app-modal-drag-handle
        >
          <h3 id="media-share-modal-title" className="text-lg font-semibold text-white">
            {tMedia('shareModalTitle')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-600/80 hover:bg-gray-500/80 text-white transition-colors"
            aria-label={tMedia('close')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-gray-300 text-sm truncate mb-1" title={shareTitle}>
          {shareTitle}
        </p>
        <div className="flex items-center gap-2 mb-5">
          <p className="flex-1 min-w-0 text-gray-500 text-xs truncate font-mono" title={shareUrl}>
            {shareUrl}
          </p>
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            )}
          </button>
        </div>
        {kakaoNotice ? (
          <p
            className="mb-4 text-xs leading-relaxed text-amber-100/95 bg-amber-950/50 border border-amber-700/45 rounded-lg px-3 py-2.5"
            role="status"
            aria-live="polite"
          >
            {kakaoNotice}
          </p>
        ) : null}
        {kakaoComposeOpen ? (
          <div className="space-y-3">
            <p className="text-gray-400 text-xs leading-relaxed">{tMedia('kakaoComposeHint')}</p>
            <div>
              <label htmlFor="kakao-share-title" className="block text-xs text-gray-400 mb-1">
                {tMedia('kakaoTitleLabel')}
              </label>
              <input
                id="kakao-share-title"
                type="text"
                value={kakaoTitle}
                onChange={(e) => setKakaoTitle(e.target.value)}
                maxLength={80}
                className="w-full rounded-lg bg-tank-black/60 border border-tank-light px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-tank-accent"
              />
            </div>
            <div>
              <label htmlFor="kakao-share-message" className="block text-xs text-gray-400 mb-1">
                {tMedia('message')}
              </label>
              <textarea
                id="kakao-share-message"
                value={kakaoMessage}
                onChange={(e) => setKakaoMessage(e.target.value)}
                rows={4}
                placeholder={tMedia('messagePlaceholder')}
                className="w-full rounded-lg bg-tank-black/60 border border-tank-light px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-tank-accent resize-none"
              />
              <p
                className={`mt-1 text-right text-xs ${
                  kakaoShareOverLimit ? 'text-amber-400' : 'text-gray-500'
                }`}
                role="status"
                aria-live="polite"
              >
                {mediaPageInterpolate(tMedia('kakaoCharLimit'), {
                  count: String(kakaoCombinedCharCount),
                })}
              </p>
            </div>
            {thumbnailUrl && thumbnailUrl.startsWith('https://') ? (
              <div className="flex items-center gap-3 rounded-lg border border-tank-light/60 bg-tank-black/40 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl}
                  alt=""
                  className="w-14 h-14 rounded object-cover shrink-0"
                />
                <p className="text-xs text-gray-500 leading-snug">{tMedia('thumbEmailNote')}</p>
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setKakaoComposeOpen(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                {tMedia('cancel')}
              </button>
              <button
                type="button"
                onClick={handleKakaoComposeSend}
                className="px-4 py-2 text-sm rounded-lg bg-[#FEE500] text-[#191919] font-medium hover:opacity-90 transition-opacity"
              >
                {tMedia('kakaoShareSend')}
              </button>
            </div>
          </div>
        ) : (
        <div className="flex items-center justify-center gap-4 flex-wrap">
          {shareAppsEnabled.email !== false && (
            <a
              href={`mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(mailBody)}`}
              onClick={() => {
                recordShareAction()
                onClose()
              }}
              className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors"
              title={tMedia('emailAppHint')}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
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
        )}
      </div>
    </AppModalOverlay>
  )
}
