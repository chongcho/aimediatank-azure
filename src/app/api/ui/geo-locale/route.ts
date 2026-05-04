import { NextResponse } from 'next/server'
import { getClientIpFromHeaders, isPrivateClientIp } from '@/lib/clientIpFromRequest'
import { lookupGeoByIp } from '@/lib/ipGeoLookup'
import { localeTagFromUserLocation } from '@/lib/localeFromLocation'

export const dynamic = 'force-dynamic'

/**
 * Guest / IP-derived UI locale for feed "Local" machine translation.
 * Uses the same country → tag mapping as profile Location (`localeTagFromUserLocation`).
 * IP is taken from proxy headers only (never from the request body).
 */
export async function GET(request: Request) {
  const ip = getClientIpFromHeaders(request.headers)
  if (!ip || isPrivateClientIp(ip)) {
    return NextResponse.json({ localeTag: localeTagFromUserLocation(null) })
  }
  const geo = await lookupGeoByIp(ip)
  const localeTag = localeTagFromUserLocation(geo.country)
  return NextResponse.json({ localeTag })
}
