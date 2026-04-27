import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { BLOCKED_IP_LIST_HEADER } from '@/lib/blockedIpListClient'

export const dynamic = 'force-dynamic'

/**
 * Server-only list for middleware IP blocking. Requires BLOCKED_IP_LIST_SECRET header.
 */
export async function GET(request: Request) {
  const secret = process.env.BLOCKED_IP_LIST_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ ips: [] })
  }
  if (request.headers.get(BLOCKED_IP_LIST_HEADER)?.trim() !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rows = await prisma.blockedIp.findMany({
      where: {
        OR: [
          { note: null },
          {
            NOT: {
              note: {
                startsWith: 'Auto (probe): EMPTY_USER_AGENT',
              },
            },
          },
        ],
      },
      select: { ipAddress: true },
    })
    return NextResponse.json({ ips: rows.map((r) => r.ipAddress) })
  } catch (e) {
    console.error('[blocked-ip-list]', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
