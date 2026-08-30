/** Twitter / OG card description limit (Twitter truncates around 200 chars). */
export const SOCIAL_CARD_DESCRIPTION_MAX = 200

export function truncateForSocialCard(text: string, max = SOCIAL_CARD_DESCRIPTION_MAX): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

/** Stable on-domain image URL for social crawlers (avoids blob extension / MIME mismatches). */
export function buildSocialCardImageUrl(baseUrl: string, mediaId: string): string {
  const root = baseUrl.replace(/\/$/, '')
  return `${root}/api/media/${mediaId}/card-image`
}
