import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/chat/voice/tts?text=...&lang=xx
 *
 * Returns spoken audio (MP3) for a voice-call ring announcement, used by the
 * callee/caller to loop "Call from {name}" / "Calling {name}" through an
 * already-unlocked AudioContext — which iOS allows without a fresh gesture,
 * unlike speechSynthesis.
 *
 * Requires AZURE_SPEECH_KEY + AZURE_SPEECH_REGION. When unset, returns 503 so
 * the client falls back to on-device speechSynthesis.
 */

// Map a UI/locale tag to an Azure neural voice. Falls back to en-US.
const VOICE_BY_LANG: Record<string, string> = {
  en: 'en-US-JennyNeural',
  ko: 'ko-KR-SunHiNeural',
  ja: 'ja-JP-NanamiNeural',
  zh: 'zh-CN-XiaoxiaoNeural',
  es: 'es-ES-ElviraNeural',
  fr: 'fr-FR-DeniseNeural',
  de: 'de-DE-KatjaNeural',
  pt: 'pt-BR-FranciscaNeural',
  it: 'it-IT-ElsaNeural',
  vi: 'vi-VN-HoaiMyNeural',
  th: 'th-TH-PremwadeeNeural',
  id: 'id-ID-GadisNeural',
  hi: 'hi-IN-SwaraNeural',
  ru: 'ru-RU-SvetlanaNeural',
}

function pickVoice(lang: string | null): { voice: string; locale: string } {
  const base = (lang || 'en').toLowerCase().split('-')[0]
  const voice = VOICE_BY_LANG[base] || VOICE_BY_LANG.en
  // Locale is the first two segments of the voice name (e.g. "en-US").
  const locale = voice.split('-').slice(0, 2).join('-')
  return { voice, locale }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const text = (searchParams.get('text') || '').trim().slice(0, 200)
  const lang = searchParams.get('lang')
  if (!text) {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }

  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) {
    return NextResponse.json({ error: 'TTS not configured' }, { status: 503 })
  }

  const { voice, locale } = pickVoice(lang)
  const ssml =
    `<speak version='1.0' xml:lang='${locale}'>` +
    `<voice xml:lang='${locale}' name='${voice}'>${escapeXml(text)}</voice>` +
    `</speak>`

  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'aimediatank-voicecall',
      },
      body: ssml,
    })
  } catch (e) {
    console.error('voice/tts: Azure request failed', e)
    return NextResponse.json({ error: 'TTS request failed' }, { status: 502 })
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.warn('voice/tts: Azure HTTP', res.status, detail.slice(0, 200))
    return NextResponse.json({ error: 'TTS synthesis failed' }, { status: 502 })
  }

  const audio = await res.arrayBuffer()
  return new NextResponse(audio, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
