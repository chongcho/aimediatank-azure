/**
 * Automatic content inspection for age-rating review.
 * Uses OpenAI Moderation API when OPENAI_API_KEY is set; otherwise a keyword-based fallback.
 */

export type InspectionResult = {
  status: 'pass' | 'review'
  summary?: string
}

const OPENAI_MODERATION_URL = 'https://api.openai.com/v1/moderations'

/** Simple keyword fallback when no API key (avoids obvious false negatives; may have false positives) */
const MATURE_KEYWORDS = [
  'nsfw', 'nude', 'nudity', 'explicit', 'adult only', '18+', 'xxx', 'porn', 'sex',
  'violence', 'gore', 'blood', 'kill', 'murder', 'drugs', 'weed', 'cocaine',
]

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Escape special regex characters so a keyword can be used in a RegExp safely */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Match only whole words to avoid false positives (e.g. "sex" in "Essex", "weed" in "seaweed"). */
function keywordCheck(text: string): { flagged: boolean; matched: string[] } {
  const normalized = normalizeText(text)
  const matched = MATURE_KEYWORDS.filter((kw) => {
    // Trailing \b only works when keyword ends with a word char; "18+" ends with "+" (non-word),
    // so \b after "+" never matches (space after "+" is also non-word). Use (?=\s|$) for those.
    const endsWithWordChar = /\w$/.test(kw)
    const endAnchor = endsWithWordChar ? '\\b' : '(?=\\s|$)'
    const re = new RegExp('\\b' + escapeRegex(kw) + endAnchor, 'i')
    return re.test(normalized)
  })
  return { flagged: matched.length > 0, matched }
}

/**
 * Inspect title + description for content that may warrant an age-rating review.
 * Returns { status: 'review', summary } when content may be mature; otherwise { status: 'pass' }.
 */
export async function inspectMediaForAgeRating(params: {
  title: string
  description?: string | null
}): Promise<InspectionResult> {
  const input = [params.title, params.description].filter(Boolean).join('\n')
  if (!input.trim()) return { status: 'pass' }

  const apiKey = process.env.OPENAI_API_KEY
  if (apiKey) {
    try {
      const res = await fetch(OPENAI_MODERATION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: input.slice(0, 32_000),
          model: 'text-moderation-latest',
        }),
      })
      if (!res.ok) {
        const err = await res.text()
        console.warn('[contentInspection] OpenAI moderation request failed:', res.status, err)
        return keywordFallback(input)
      }
      const data = (await res.json()) as {
        results?: Array<{
          flagged?: boolean
          categories?: {
            sexual?: boolean
            'sexual/minors'?: boolean
            violence?: boolean
            'violence/graphic'?: boolean
            hate?: boolean
            'self-harm'?: boolean
            'hate/threatening'?: boolean
          }
        }>
      }
      const result = data.results?.[0]
      if (!result?.flagged) return { status: 'pass' }
      const cats = result.categories || {}
      const reasons: string[] = []
      if (cats.sexual || cats['sexual/minors']) reasons.push('sexual')
      if (cats.violence || cats['violence/graphic']) reasons.push('violence')
      if (cats.hate || cats['hate/threatening']) reasons.push('hate')
      if (cats['self-harm']) reasons.push('self-harm')
      const summary = reasons.length
        ? `Text may suggest: ${reasons.join(', ')}. Please review age rating.`
        : 'Content flagged for review. Please check age rating.'
      return { status: 'review', summary }
    } catch (e) {
      console.warn('[contentInspection] OpenAI moderation error:', e)
      return keywordFallback(input)
    }
  }

  return keywordFallback(input)
}

function keywordFallback(input: string): InspectionResult {
  const { flagged, matched } = keywordCheck(input)
  if (!flagged) return { status: 'pass' }
  return {
    status: 'review',
    summary: `Keyword match (${matched.slice(0, 3).join(', ')}). Please review age rating.`,
  }
}
