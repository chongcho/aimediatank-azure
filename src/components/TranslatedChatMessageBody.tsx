'use client'

import { useMemo } from 'react'
import { useTranslatedSingle } from '@/hooks/useTranslatedTexts'
import { normalizeChatMessagePlainText, renderNormalizedChatPlainText } from '@/lib/chatMessageDisplay'

export function TranslatedChatMessageBody({
  content,
  mtLocaleTag,
}: {
  content: string
  mtLocaleTag: string
}) {
  const plain = useMemo(() => normalizeChatMessagePlainText(content), [content])
  const enabled = Boolean(plain.trim())
  const translated = useTranslatedSingle(plain, mtLocaleTag, enabled)
  const body = useMemo(() => renderNormalizedChatPlainText(translated), [translated])
  if (!enabled) return null
  return <>{body}</>
}
