import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { token?: string; platform?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const token = (body.token || '').trim().toLowerCase()
  if (!token || !/^[0-9a-f]{32,}$/i.test(token)) {
    return NextResponse.json({ error: 'Invalid VoIP push token' }, { status: 400 })
  }

  const platform = (body.platform || 'ios').trim() || 'ios'
  const userAgent = request.headers.get('user-agent')

  await prisma.voipPushToken.upsert({
    where: { token },
    create: {
      userId: session.user.id,
      token,
      platform,
      userAgent,
    },
    update: {
      userId: session.user.id,
      platform,
      userAgent,
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await prisma.voipPushToken.deleteMany({
    where: { userId: session.user.id },
  })

  return NextResponse.json({ ok: true })
}
