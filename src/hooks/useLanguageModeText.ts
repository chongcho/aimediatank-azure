'use client'

import { useTranslatedList, useTranslatedSingle } from '@/hooks/useTranslatedTexts'
import { useLanguageModeMt } from '@/hooks/useLanguageModeMt'

/** Translate a fixed list of UI strings per Navbar language mode. */
export function useLanguageModeList(originals: readonly string[]): string[] {
  const { translateEnabled, mtTag } = useLanguageModeMt()
  return useTranslatedList(originals, mtTag, translateEnabled)
}

/** Translate one dynamic UI string (errors, composed labels) per language mode. */
export function useLanguageModeText(source: string): string {
  const { translateEnabled, mtTag } = useLanguageModeMt()
  return useTranslatedSingle(source, mtTag, translateEnabled && Boolean(source.trim()))
}
