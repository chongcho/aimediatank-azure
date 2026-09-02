import { prisma } from '@/lib/prisma'
import { isPrivateClientIp } from '@/lib/clientIpFromRequest'
import { isPlausibleIpAddress, normalizeStoredIp } from '@/lib/ipBlockUtils'

/** Flags that warrant adding the client IP to BlockedIp (probe dictionary / bad bots). */
export function shouldAutoBlockForFlags(flags: string[]): boolean {
  return flags.some(
    (f) =>
      f.startsWith('PROBE_') ||
      f === 'PATH_TRAVERSAL' ||
      f.startsWith('BAD_BOT_') ||
      f === 'LEAK_SUSPECTED'
  )
}

/** On by default when blocklist enforcement secret is set; opt out with AUTO_BLOCK_PROBE_IPS=false. */
export function isAutoBlockProbeEnabled(): boolean {
  if (process.env.AUTO_BLOCK_PROBE_IPS === 'false') return false
  if (process.env.AUTO_BLOCK_PROBE_IPS === 'true') return true
  return Boolean(process.env.BLOCKED_IP_LIST_SECRET?.trim())
}

export async function tryAutoBlockProbeIp(params: {
  ipAddress: string | null | undefined
  path: string
  flags: string[]
  category: 'probe' | 'bad_bot'
  userAgent?: string | null
}): Promise<{ ok: boolean; created?: boolean; duplicate?: boolean; skipped?: boolean }> {
  if (!isAutoBlockProbeEnabled()) return { ok: true, skipped: true }
  if (!shouldAutoBlockForFlags(params.flags)) return { ok: true, skipped: true }

  const normalized = normalizeStoredIp(params.ipAddress ?? '')
  if (!normalized || !isPlausibleIpAddress(normalized) || isPrivateClientIp(normalized)) {
    return { ok: true, skipped: true }
  }

  const flagStr = params.flags.slice(0, 10).join(', ') + (params.flags.length > 10 ? '…' : '')
  const prefix = params.category === 'bad_bot' ? 'Auto (bad-bot)' : 'Auto (probe)'
  const uaRaw = params.userAgent ?? ''
  const uaSnip =
    params.category === 'bad_bot' && uaRaw
      ? ` · UA ${uaRaw.replace(/\s+/g, ' ').trim().slice(0, 160)}`
      : ''
  const note = `${prefix}: ${flagStr || '?'} · ${params.path.slice(0, 320)}${uaSnip}`.slice(0, 2000)

  try {
    await prisma.blockedIp.create({
      data: {
        ipAddress: normalized,
        note,
        createdBy: null,
      },
    })
    return { ok: true, created: true }
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code?: string }).code : ''
    if (code === 'P2002') return { ok: true, duplicate: true }
    throw e
  }
}
