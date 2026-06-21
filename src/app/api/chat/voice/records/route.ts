import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { VOICE_CALL_USER_SELECT } from '@/lib/voiceCallUser'

export const dynamic = 'force-dynamic'

/** GET /api/chat/voice/records — recent voice call history for the call picker */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user.role !== 'SUBSCRIBER' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only subscribers can use voice calls' }, { status: 403 })
    }

    const userId = session.user.id
    const calls = await prisma.voiceCall.findMany({
      where: {
        OR: [{ callerId: userId }, { calleeId: userId }],
        status: { in: ['ended', 'rejected', 'missed', 'active', 'ringing'] },
      },
      include: {
        caller: { select: VOICE_CALL_USER_SELECT },
        callee: { select: VOICE_CALL_USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    const seenPeers = new Set<string>()
    const records = []

    for (const call of calls) {
      const isOutgoing = call.callerId === userId
      const peer = isOutgoing ? call.callee : call.caller
      if (!peer || seenPeers.has(peer.id)) continue
      seenPeers.add(peer.id)
      records.push({
        callId: call.id,
        peer,
        direction: isOutgoing ? 'outgoing' : 'incoming',
        status: call.status,
        at: (call.endedAt ?? call.createdAt).toISOString(),
      })
      if (records.length >= 50) break
    }

    return NextResponse.json({ records })
  } catch (error) {
    console.error('Error fetching voice call records:', error)
    return NextResponse.json({ error: 'Failed to fetch voice call records' }, { status: 500 })
  }
}
