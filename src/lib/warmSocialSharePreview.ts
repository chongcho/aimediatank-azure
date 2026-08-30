/** Fire-and-forget requests so X, LinkedIn, and other OG crawlers hit warm HTML + image caches. */
export function warmSocialSharePreview(options: {
  mediaId: string
  cardImageUrl?: string
  thumbnailUrl?: string | null
}): void {
  const { mediaId, cardImageUrl, thumbnailUrl } = options

  const warm = (url: string) => {
    fetch(url, { credentials: 'omit', cache: 'no-store' }).catch(() => {})
  }

  warm(`/api/og-preview/${encodeURIComponent(mediaId)}`)
  if (cardImageUrl) warm(cardImageUrl)
  if (thumbnailUrl?.startsWith('https://')) warm(thumbnailUrl)
}
