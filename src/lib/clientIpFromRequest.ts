/** Strip bracketed IPv6 and `host:port` forms (same rules as middleware). */
export function stripClientIpPort(raw: string): string {
  if (raw.startsWith('[')) return raw.replace(/^\[([^\]]+)\].*$/, '$1')
  const parts = raw.split(':')
  if (parts.length === 2 && /^\d+$/.test(parts[1])) return parts[0]
  return raw
}

export function isPrivateClientIp(ip: string): boolean {
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

/** First client IP from proxy headers (trusted edge only). */
export function getClientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')
  const raw = forwarded
    ? (forwarded.split(',')[0]?.trim() ?? null)
    : headers.get('x-real-ip') ?? null
  return raw ? stripClientIpPort(raw) : null
}
