/**
 * Normalize IPs for blocklist storage and lookup (match middleware client IP extraction).
 */
export function normalizeStoredIp(raw: string): string {
  let t = raw.trim()
  if (!t) return ''
  if (t.startsWith('[')) t = t.replace(/^\[([^\]]+)\].*$/, '$1')
  const parts = t.split(':')
  if (parts.length === 2 && /^\d+$/.test(parts[1])) t = parts[0]
  if (t.includes(':')) return t.toLowerCase()
  return t
}

export function isPlausibleIpAddress(ip: string): boolean {
  const n = normalizeStoredIp(ip)
  if (!n) return false
  // Spoofed X-Forwarded-For hostnames seen in scanner traffic (manual block only).
  if (n.toLowerCase() === 'localhost') return true
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(n)) {
    const octets = n.split('.').map((x) => Number(x))
    return octets.length === 4 && octets.every((o) => !Number.isNaN(o) && o >= 0 && o <= 255)
  }
  if (n.includes(':')) {
    return n.length >= 3 && n.length <= 64
  }
  return false
}
