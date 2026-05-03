'use client'

import { useMemo } from 'react'
import { useTranslatedSingle } from '@/hooks/useTranslatedTexts'
import { normalizeChatMessagePlainText, renderNormalizedChatPlainText } from '@/lib/chatMessageDisplay'

export function TranslatedChatMessageBody({
  content,
  mtLocaleTag,
  autoTranslationEnabled = true,
}: {
  content: string
  mtLocaleTag: string
  autoTranslationEnabled?: boolean
}) {
  const plain = useMemo(() => normalizeChatMessagePlainText(content), [content])
  const enabled = Boolean(plain.trim())
  const translated = useTranslatedSingle(plain, mtLocaleTag, autoTranslationEnabled && enabled)
  const body = useMemo(() => renderNormalizedChatPlainText(translated), [translated])
  if (!enabled) return null
  return <>{body}</>
}
