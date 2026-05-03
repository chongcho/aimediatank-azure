import { htmlLangFromUiTag } from '@/messages/navBar'

/** BCP 47 tag for `toLocaleDateString` / formatting from short UI locale (matches navbar). */
export function calendarLocaleFromUiTag(tag: string | undefined): string {
  return htmlLangFromUiTag(tag)
}

/** Map UI tag to Azure Translator `to` parameter where it differs. */
export function translatorToFromUiTag(tag: string | undefined): string {
  const t = (tag || 'en').toLowerCase().split('-')[0]
  const map: Record<string, string> = {
    zh: 'zh-Hans',
    no: 'nb',
  }
  return map[t] || t || 'en'
}
