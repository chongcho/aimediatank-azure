import { isPrivateClientIp } from '@/lib/clientIpFromRequest'

/** Proxy / platform headers useful when client IP is localhost or private. */
const IP_DEBUG_HEADER_NAMES = [
  'x-forwarded-for',
  'x-real-ip',
  'x-arr-log-id',
  'x-original-url',
  'x-waws-unencoded-url',
  'x-site-deployment-id',
  'was-default-hostname',
  'client-ip',
  'true-client-ip',
  'cf-connecting-ip',
  'x-azure-clientip',
  'x-azure-socketip',
  'x-forwarded-proto',
  'x-forwarded-host',
  'x-forwarded-port',
  'host',
  'via',
  'forwarded',
] as const

const MAX_HEADER_VALUE_LEN = 1024
const MAX_JSON_LEN = 4096

export type IpDebugHeaders = Record<string, string>

/** Collect allowlisted request headers for localhost/private-IP investigation. */
export function collectIpDebugHeaders(headers: Headers): IpDebugHeaders | null {
  const out: IpDebugHeaders = {}

  for (const name of IP_DEBUG_HEADER_NAMES) {
    const value = headers.get(name)
    if (value) out[name] = value.slice(0, MAX_HEADER_VALUE_LEN)
  }

  headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if ((lower.startsWith('x-azure-') || lower.startsWith('x-arr-')) && !out[lower]) {
      out[lower] = value.slice(0, MAX_HEADER_VALUE_LEN)
    }
  })

  return Object.keys(out).length > 0 ? out : null
}

/** Store debug headers when IP is missing or private (127.0.0.1, RFC1918, etc.). */
export function shouldCaptureIpDebugHeaders(ip: string | null): boolean {
  if (!ip) return true
  return isPrivateClientIp(ip)
}

/** JSON string for DB storage (bounded size). */
export function serializeIpDebugHeaders(headers: IpDebugHeaders | null): string | null {
  if (!headers) return null
  const json = JSON.stringify(headers)
  if (json.length <= MAX_JSON_LEN) return json
  return json.slice(0, MAX_JSON_LEN)
}

export function parseIpDebugHeaders(raw: string | null | undefined): IpDebugHeaders | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const out: IpDebugHeaders = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') out[key] = value
    }
    return Object.keys(out).length > 0 ? out : null
  } catch {
    return null
  }
}
