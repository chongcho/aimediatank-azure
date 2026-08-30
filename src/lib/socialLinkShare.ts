/** X compose intent — url + optional commentary (same fields as the native tweet dialog). */
export function buildXShareUrl(shareUrl: string, shareTitle: string): string {
  return `https://x.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`
}

/** LinkedIn off-site share — preview title/image/description come from OG tags on shareUrl. */
export function buildLinkedInShareUrl(shareUrl: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
}
