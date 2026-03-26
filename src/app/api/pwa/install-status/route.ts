import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ installed: false, reason: 'not-authenticated' })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { pwaInstalledAt: true },
    })

    return NextResponse.json({
      installed: !!user?.pwaInstalledAt,
      installedAt: user?.pwaInstalledAt,
    })
  } catch (err) {
    console.error('PWA install-status GET error:', err)
    return NextResponse.json({ installed: false, reason: 'error' })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, reason: 'not-authenticated' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action ?? 'install'

    if (action === 'install') {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { pwaInstalledAt: new Date() },
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'uninstall') {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { pwaInstalledAt: null },
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, reason: 'invalid-action' }, { status: 400 })
  } catch (err) {
    console.error('PWA install-status POST error:', err)
    return NextResponse.json({ success: false, reason: 'error' }, { status: 500 })
  }
}
