/**
 * Edge-safe: fetch blocklist for middleware (no Prisma). Uses in-memory TTL cache per isolate.
 */
import { normalizeStoredIp } from '@/lib/ipBlockUtils'

export const BLOCKED_IP_LIST_HEADER = 'x-blocked-ip-list-secret'

const TTL_MS = 45_000

let cache: { set: Set<string>; exp: number } | null = null

export async function isClientIpBlocked(clientIp: string | null, origin: string): Promise<boolean> {
  const secret = process.env.BLOCKED_IP_LIST_SECRET?.trim()
  if (!secret || !clientIp) return false

  const key = normalizeStoredIp(clientIp)
  if (!key) return false

  const now = Date.now()
  if (!cache || cache.exp <= now) {
    try {
      const res = await fetch(`${origin}/api/internal/blocked-ip-list`, {
        headers: { [BLOCKED_IP_LIST_HEADER]: secret },
        cache: 'no-store',
      })
      if (!res.ok) {
        return false
      }
      const data = (await res.json()) as { ips?: string[] }
      const ips = Array.isArray(data.ips) ? data.ips.map((x) => normalizeStoredIp(String(x))).filter(Boolean) : []
      cache = { set: new Set(ips), exp: now + TTL_MS }
    } catch {
      return false
    }
  }

  return cache!.set.has(key)
}
