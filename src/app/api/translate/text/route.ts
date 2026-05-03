import { NextResponse } from 'next/server'
import { getFirstHomeLayoutSetting } from '@/lib/homeLayoutSetting'
import { translatorToFromUiTag } from '@/lib/localeUi'
import { translateWithMyMemory } from '@/lib/mymemoryTranslate'

export const dynamic = 'force-dynamic'

const cache = new Map<string, string>()
const MAX_CACHE = 400

function cacheKey(to: string, text: string) {
  return `${to}::${text.slice(0, 2000)}`
}

async function translateTextsViaMyMemory(
  texts: string[],
  to: string,
  cache: Map<string, string>
): Promise<string[]> {
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
    const translated = await translateWithMyMemory(text, to)
    if (cache.size >= MAX_CACHE) {
      const firstKey = cache.keys().next().value
      if (firstKey) cache.delete(firstKey)
    }
    cache.set(ck, translated)
    out.push(translated)
  }
  return out
}

/**
 * POST { texts: string[], to?: string } — returns { translated: string[] }.
 *
 * **Azure-first:** When `AZURE_TRANSLATOR_KEY` and `AZURE_TRANSLATOR_REGION` are both set,
 * Azure Translator is called first. Optional `AZURE_TRANSLATOR_ENDPOINT` (no trailing slash).
 *
 * **MyMemory fallback:** Used when Azure is not configured, or when Azure fails and
 * `DISABLE_MYMEMORY_FALLBACK` is not `1` / `true`.
 *
 * **Azure-only:** Set `DISABLE_MYMEMORY_FALLBACK=1` so failures return originals with no MyMemory.
 *
 * Optional: `MYMEMORY_CONTACT_EMAIL` — registered email improves MyMemory daily quota.
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
    const useAzure = Boolean(key && region)
    const myMemoryDisabled =
      process.env.DISABLE_MYMEMORY_FALLBACK === '1' ||
      process.env.DISABLE_MYMEMORY_FALLBACK === 'true'

    const originalsAsStrings = (texts as unknown[]).map((t) => String(t ?? ''))

    try {
      const layoutRow = await getFirstHomeLayoutSetting()
      if (layoutRow?.autoTranslation === false) {
        return NextResponse.json({ translated: originalsAsStrings })
      }
    } catch {
      /* continue — translate when layout setting unavailable */
    }

    if (!useAzure && myMemoryDisabled) {
      return NextResponse.json({ translated: originalsAsStrings })
    }

    if (useAzure) {
      const azure = await translateAzureBatch(originalsAsStrings, to, key!, region!)
      if (azure.ok) {
        return NextResponse.json({ translated: azure.translated })
      }
      if (myMemoryDisabled) {
        return NextResponse.json({ translated: azure.translated })
      }
    }

    if (!myMemoryDisabled) {
      const out = await translateTextsViaMyMemory(originalsAsStrings, to, cache)
      return NextResponse.json({ translated: out })
    }

    return NextResponse.json({ translated: originalsAsStrings })
  } catch (e) {
    console.error('translate/text:', e)
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 })
  }
}

async function translateAzureBatch(
  texts: string[],
  to: string,
  key: string,
  region: string
): Promise<{ ok: boolean; translated: string[] }> {
  const originals = texts.map((t) => String(t ?? ''))
  const endpoint =
    process.env.AZURE_TRANSLATOR_ENDPOINT?.replace(/\/$/, '') ||
    'https://api.cognitive.microsofttranslator.com'

  const body = texts.map((raw) => {
    const t = String(raw ?? '')
    return { Text: t.trim() ? t.slice(0, 50000) : ' ' }
  })

  const res = await fetch(
    `${endpoint}/translate?api-version=3.0&to=${encodeURIComponent(to)}`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Ocp-Apim-Subscription-Region': region,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    console.warn('translate/text: Azure Translator HTTP', res.status, res.statusText)
    return { ok: false, translated: originals }
  }

  let data: { translations?: { text: string }[] }[]
  try {
    data = (await res.json()) as { translations?: { text: string }[] }[]
  } catch {
    return { ok: false, translated: originals }
  }

  if (!Array.isArray(data) || data.length !== texts.length) {
    return { ok: false, translated: originals }
  }

  const translated = texts.map((raw, i) => {
    const original = String(raw ?? '')
    if (!original.trim()) return ''
    const tr = data[i]?.translations?.[0]?.text
    return typeof tr === 'string' && tr.trim() ? tr : original
  })

  return { ok: true, translated }
}
