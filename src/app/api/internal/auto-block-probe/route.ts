import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { BLOCKED_IP_LIST_HEADER } from '@/lib/blockedIpListClient'
import { normalizeStoredIp, isPlausibleIpAddress } from '@/lib/ipBlockUtils'

export const dynamic = 'force-dynamic'

function isPrivateIp(ip: string): boolean {
  return (
    ip.startsWith('10.') ||
    ip.startsWith('127.') ||
    ip.startsWith('192.168.') ||
    ip === '::1' ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  )
}

/**
 * Called from middleware when a probe path is denied. Adds client IP to BlockedIp (note: Auto: …).
 * Secured with the same header secret as other internal blocklist routes.
 */
export async function POST(request: Request) {
  const secret = process.env.BLOCKED_IP_LIST_SECRET?.trim()
  if (!secret || request.headers.get(BLOCKED_IP_LIST_HEADER)?.trim() !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const rawIp = typeof body.ipAddress === 'string' ? body.ipAddress : ''
  const path = typeof body.path === 'string' ? body.path : ''
  const flags = Array.isArray(body.flags) ? body.flags.filter((x: unknown) => typeof x === 'string') : []

  const normalized = normalizeStoredIp(rawIp)
  if (!normalized || !isPlausibleIpAddress(normalized) || isPrivateIp(normalized)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const flagStr = flags.slice(0, 10).join(', ') + (flags.length > 10 ? '…' : '')
  const note = `Auto (probe): ${flagStr || '?'} · ${path.slice(0, 400)}`.slice(0, 2000)

  try {
    await prisma.blockedIp.create({
      data: {
        ipAddress: normalized,
        note,
        createdBy: null,
      },
    })
    return NextResponse.json({ ok: true, created: true })
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code?: string }).code : ''
    if (code === 'P2002') {
      return NextResponse.json({ ok: true, duplicate: true })
    }
    console.error('[auto-block-probe]', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
