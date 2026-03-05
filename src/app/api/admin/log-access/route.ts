import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseUserAgent } from '@/lib/parseUserAgent'

export const dynamic = 'force-dynamic'

// In-memory cache: IP → { city, region, country, expires }
const geoCache = new Map<string, { city: string | null; region: string | null; country: string | null; expires: number }>()
const GEO_CACHE_TTL = 1000 * 60 * 60 * 24 // 24 hours
const GEO_CACHE_MAX = 2000

async function lookupGeo(rawIp: string): Promise<{ city: string | null; region: string | null; country: string | null }> {
  const ip = rawIp.startsWith('[') ? rawIp.replace(/^\[([^\]]+)\].*$/, '$1') : rawIp.includes(':') && rawIp.split(':').length === 2 && /^\d+$/.test(rawIp.split(':')[1]) ? rawIp.split(':')[0] : rawIp
  const now = Date.now()
  const cached = geoCache.get(ip)
  if (cached && cached.expires > now) return cached

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,country`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return { city: null, region: null, country: null }
    const data = await res.json()
    if (data.status !== 'success') return { city: null, region: null, country: null }
    const geo = { city: data.city ?? null, region: data.regionName ?? null, country: data.country ?? null }
    if (geoCache.size >= GEO_CACHE_MAX) {
      const first = geoCache.keys().next().value
      if (first) geoCache.delete(first)
    }
    geoCache.set(ip, { ...geo, expires: now + GEO_CACHE_TTL })
    return geo
  } catch {
    return { city: null, region: null, country: null }
  }
}

/**
 * POST /api/admin/log-access
 * Called by middleware (fire-and-forget) to record page visits.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const {
      ipAddress,
      userAgent,
      path,
      method = 'GET',
      query,
      referrer,
      sessionId,
      userId,
      userName,
      userEmail,
      statusCode,
    } = body as {
      ipAddress?: string
      userAgent?: string
      path?: string
      method?: string
      query?: string
      referrer?: string
      sessionId?: string
      userId?: string
      userName?: string
      userEmail?: string
      statusCode?: number
    }

    if (!path || typeof path !== 'string') {
      return NextResponse.json({ error: 'path required' }, { status: 400 })
    }

    const { browser, os, device } = parseUserAgent(userAgent)

    let city: string | null = null
    let region: string | null = null
    let country: string | null = null

    const isPrivateIp = (ip: string) =>
      ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('192.168.') ||
      ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(ip)

    if (ipAddress && !isPrivateIp(ipAddress)) {
      const geo = await lookupGeo(ipAddress)
      city = geo.city
      region = geo.region
      country = geo.country
    }

    await prisma.siteAccessLog.create({
      data: {
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        browser: browser ?? null,
        os: os ?? null,
        device: device ?? null,
        city,
        region,
        country,
        path: path.substring(0, 2048),
        method: method.substring(0, 16),
        query: query ? String(query).substring(0, 2048) : null,
        referrer: referrer ? String(referrer).substring(0, 2048) : null,
        sessionId: sessionId ?? null,
        userId: userId ?? null,
        userName: userName ?? null,
        userEmail: userEmail ?? null,
        statusCode: statusCode ?? null,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[log-access]', e)
    return NextResponse.json({ error: 'Failed to log' }, { status: 500 })
  }
}
