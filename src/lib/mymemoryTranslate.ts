/**
 * Fallback machine translation via MyMemory public API (when Azure Translator is not configured).
 * Sends text to a third party — disable with DISABLE_MYMEMORY_FALLBACK=1 on the server.
 * @see https://mymemory.translated.net/doc/spec.php
 */

const CHUNK = 450
const BETWEEN_MS = 120

/** MyMemory `langpair` target side (source is assumed English for media copy). */
export function myMemoryTargetLang(azureStyleTo: string): string {
  const t = (azureStyleTo || 'en').toLowerCase()
  if (t === 'zh-hans' || t.startsWith('zh')) return 'zh-CN'
  // MyMemory uses ISO-style codes; Bokmål `nb` is often listed as `no`.
  if (t === 'nb') return 'no'
  return t.split('-')[0] || 'en'
}

export async function translateWithMyMemory(text: string, targetLang: string): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const tgt = myMemoryTargetLang(targetLang)
  if (tgt === 'en') return text

  const email = process.env.MYMEMORY_CONTACT_EMAIL?.trim()
  const parts: string[] = []
  for (let i = 0; i < text.length; i += CHUNK) {
    const chunk = text.slice(i, i + CHUNK)
    if (!chunk.trim()) {
      parts.push(chunk)
      continue
    }
    const params = new URLSearchParams({
      q: chunk,
      langpair: `en|${tgt}`,
    })
    if (email) params.set('de', email)

    const url = `https://api.mymemory.translated.net/get?${params.toString()}`
    const res = await fetch(url)
    if (!res.ok) {
      parts.push(chunk)
      continue
    }
    const data = (await res.json()) as {
      responseData?: { translatedText?: string }
      responseStatus?: number
      quotaFinished?: boolean
    }
    const status = data.responseStatus ?? 200
    const tr = data.responseData?.translatedText
    const ok =
      typeof tr === 'string' &&
      tr.trim() &&
      status === 200 &&
      data.quotaFinished !== true &&
      !tr.includes('MYMEMORY WARNING')
    if (ok) {
      parts.push(tr)
    } else {
      parts.push(chunk)
    }
    if (i + CHUNK < text.length) {
      await new Promise((r) => setTimeout(r, BETWEEN_MS))
    }
  }
  return parts.join('')
}
