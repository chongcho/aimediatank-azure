import { NextResponse } from 'next/server'
import { translatorToFromUiTag } from '@/lib/localeUi'

export const dynamic = 'force-dynamic'

const cache = new Map<string, string>()
const MAX_CACHE = 400

function cacheKey(to: string, text: string) {
  return `${to}::${text.slice(0, 2000)}`
}

/**
 * POST { texts: string[], to?: string } — returns { translated: string[] }.
 * When `AZURE_TRANSLATOR_KEY` + `AZURE_TRANSLATOR_REGION` are set, uses Azure Translator;
 * otherwise returns the input strings unchanged (no extra cost).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const texts: unknown = body?.texts
    const toRaw = typeof body?.to === 'string' ? body.to : 'en'
    if (!Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json({ error: 'texts array required' }, { status: 400 })
    }
    const to = translatorToFromUiTag(toRaw)
    if (to === 'en' || toRaw.toLowerCase().split('-')[0] === 'en') {
      return NextResponse.json({ translated: texts.map((t) => String(t ?? '')) })
    }

    const key = process.env.AZURE_TRANSLATOR_KEY
    const region = process.env.AZURE_TRANSLATOR_REGION
    if (!key || !region) {
      return NextResponse.json({ translated: texts.map((t) => String(t ?? '')) })
    }

    const out: string[] = []
    for (const raw of texts) {
      const text = String(raw ?? '')
      if (!text.trim()) {
        out.push('')
        continue
      }
      const ck = cacheKey(to, text)
      const hit = cache.get(ck)
      if (hit !== undefined) {
        out.push(hit)
        continue
      }

      const endpoint =
        process.env.AZURE_TRANSLATOR_ENDPOINT?.replace(/\/$/, '') ||
        'https://api.cognitive.microsofttranslator.com'

      const res = await fetch(
        `${endpoint}/translate?api-version=3.0&to=${encodeURIComponent(to)}`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': key,
            'Ocp-Apim-Subscription-Region': region,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([{ Text: text.slice(0, 50000) }]),
        }
      )

      if (!res.ok) {
        out.push(text)
        continue
      }
      const data = (await res.json()) as { translations?: { text: string }[] }[]
      const translated = data?.[0]?.translations?.[0]?.text ?? text
      if (cache.size >= MAX_CACHE) {
        const firstKey = cache.keys().next().value
        if (firstKey) cache.delete(firstKey)
      }
      cache.set(ck, translated)
      out.push(translated)
    }

    return NextResponse.json({ translated: out })
  } catch (e) {
    console.error('translate/text:', e)
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 })
  }
}
