import { calendarLocaleFromUiTag } from '@/lib/localeUi'

/** Relative day label (today / yesterday / N days ago) in the user’s UI calendar locale. */
export function formatRelativeUploadDay(dateString: string, localeTag: string | undefined): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  const loc = calendarLocaleFromUiTag(localeTag)
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' })
  if (diffDays <= 0) {
    return rtf.format(0, 'day')
  }
  return rtf.format(-diffDays, 'day')
}
