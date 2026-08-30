/** User-agents used by Meta/WhatsApp Web and other link-preview fetchers. */
const SOCIAL_PREVIEW_CRAWLER_PATTERNS: RegExp[] = [
  /facebookexternalhit/i,
  /\bWhatsApp\//i,
  /LinkedInBot/i,
  /Twitterbot/i,
  /Slackbot/i,
  /TelegramBot/i,
  /Discordbot/i,
  /Pinterestbot/i,
]

export function isSocialPreviewCrawler(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? '').trim()
  if (!ua) return false
  return SOCIAL_PREVIEW_CRAWLER_PATTERNS.some((re) => re.test(ua))
}

/** `/media/{id}` detail page only (not `/media/{id}/card-image`, `/edit`, etc.). */
export function parseMediaDetailPath(pathname: string): string | null {
  const match = pathname.match(/^\/media\/([^/]+)$/)
  return match ? match[1] : null
}
