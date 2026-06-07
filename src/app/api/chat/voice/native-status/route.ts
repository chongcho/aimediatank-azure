import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'
import { verifyVoiceCallDeclineToken } from '@/lib/voiceCallDeclineToken'

export const dynamic = 'force-dynamic'

/** Poll call status from native CallKit (lock screen, no browser session). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const callId = normalizeVoiceCallId(searchParams.get('callId'))
  const token = (searchParams.get('token') || '').trim()

  if (!callId || !token) {
    return NextResponse.json({ error: 'callId and token required' }, { status: 400 })
  }
  if (!verifyVoiceCallDeclineToken(callId, token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const call = await prisma.voiceCall.findUnique({
    where: { id: callId },
    select: { status: true },
  })

  return NextResponse.json({ status: call?.status ?? 'gone' })
}
