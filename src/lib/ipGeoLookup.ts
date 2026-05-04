// Shared geo lookup for access logs and guest UI locale (ip-api.com, in-memory cache).

const geoCache = new Map<string, { city: string | null; region: string | null; country: string | null; expires: number }>()
const GEO_CACHE_TTL = 1000 * 60 * 60 * 24 // 24 hours
const GEO_CACHE_MAX = 2000

function normalizeIpForLookup(rawIp: string): string {
  if (rawIp.startsWith('[')) return rawIp.replace(/^\[([^\]]+)\].*$/, '$1')
  if (rawIp.includes(':') && rawIp.split(':').length === 2 && /^\d+$/.test(rawIp.split(':')[1])) {
    return rawIp.split(':')[0]
  }
  return rawIp
}

export async function lookupGeoByIp(rawIp: string): Promise<{
  city: string | null
  region: string | null
  country: string | null
}> {
  const ip = normalizeIpForLookup(rawIp)
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
