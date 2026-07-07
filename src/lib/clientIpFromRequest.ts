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

function parseXForwardedForChain(forwarded: string): string[] {
  return forwarded
    .split(',')
    .map((part) => stripClientIpPort(part.trim()))
    .filter(Boolean)
}

/** First public IP in an X-Forwarded-For chain (handles Azure prepending 127.0.0.1). */
function firstPublicIpInChain(ips: string[]): string | null {
  for (const ip of ips) {
    if (!isPrivateClientIp(ip)) return ip
  }
  return null
}

function parseForwardedHeaderForIp(value: string): string | null {
  for (const segment of value.split(',')) {
    const match = segment.trim().match(/^for=(?:"\[([^\]]+)\]"|\[([^\]]+)\]|"([^"]+)"|([^;\s"]+))/i)
    if (!match) continue
    const raw = match[1] || match[2] || match[3] || match[4]
    if (!raw || raw.toLowerCase() === 'unknown') continue
    const ip = stripClientIpPort(raw)
    if (ip && !isPrivateClientIp(ip)) return ip
  }
  return null
}

function readHeaderIp(headers: Headers, name: string): string | null {
  const value = headers.get(name)
  if (!value) return null
  const ip = stripClientIpPort(value.trim())
  return ip || null
}

function isAzureAppServiceRuntime(): boolean {
  return Boolean(process.env.WEBSITE_SITE_NAME || process.env.WEBSITE_INSTANCE_ID)
}

/**
 * Resolve the visitor IP from proxy / platform headers.
 * On Azure App Service the TCP hop is often 127.0.0.1; the real client may appear
 * later in X-Forwarded-For or in Azure / CDN single-IP headers.
 */
export function getClientIpFromHeaders(headers: Headers): string | null {
  const azureRuntime = isAzureAppServiceRuntime()

  const trustedSingleIpHeaders = azureRuntime
    ? [
        'x-azure-clientip',
        'x-azure-socketip',
        'true-client-ip',
        'cf-connecting-ip',
        'x-real-ip',
        'x-arr-clientip',
      ]
    : ['true-client-ip', 'cf-connecting-ip', 'x-real-ip']

  for (const name of trustedSingleIpHeaders) {
    const ip = readHeaderIp(headers, name)
    if (ip && !isPrivateClientIp(ip)) return ip
  }

  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const chain = parseXForwardedForChain(forwarded)
    const publicIp = firstPublicIpInChain(chain)
    if (publicIp) return publicIp
    if (chain[0]) return chain[0]
  }

  const forwardedHeader = headers.get('forwarded')
  if (forwardedHeader) {
    const ip = parseForwardedHeaderForIp(forwardedHeader)
    if (ip) return ip
  }

  for (const name of ['client-ip', ...trustedSingleIpHeaders]) {
    const ip = readHeaderIp(headers, name)
    if (ip) return ip
  }

  return null
}

function hasAzureAppServiceMarkers(headers: Headers): boolean {
  return Boolean(
    headers.get('x-site-deployment-id') ||
      headers.get('was-default-hostname') ||
      headers.get('x-arr-log-id')
  )
}

/** Azure Always On / platform health pings — not useful in access logs. */
export function isLikelyAzurePlatformPing(input: {
  headers: Headers
  clientIp: string | null
  pathname: string
  userAgent?: string | null
  referrer?: string | null
}): boolean {
  const { headers, clientIp, pathname, userAgent, referrer } = input
  if (!clientIp || !isPrivateClientIp(clientIp)) return false
  if (pathname !== '/' && pathname !== '/api/health') return false
  if (!hasAzureAppServiceMarkers(headers)) return false

  // Loopback on App Service is always the internal ARR→container hop, never a real visitor.
  if (clientIp.startsWith('127.') || clientIp === '::1') return true

  const ua = (userAgent || '').trim()
  if (!ua && !referrer) return true

  return false
}

/** Secondary filter when only stored log fields / ipDebug JSON are available. */
export function isLikelyAzurePlatformPingFromLog(input: {
  ipAddress?: string | null
  path?: string | null
  userAgent?: string | null
  referrer?: string | null
  ipDebugHeaders?: string | null
}): boolean {
  const path = (input.path || '').split('?')[0] || ''
  if (path !== '/' && path !== '/api/health') return false

  const ip = input.ipAddress ? stripClientIpPort(input.ipAddress) : null
  if (!ip || !isPrivateClientIp(ip)) return false

  let hasAzureMarkers = false
  if (input.ipDebugHeaders) {
    try {
      const parsed = JSON.parse(input.ipDebugHeaders) as Record<string, unknown>
      hasAzureMarkers = Boolean(
        parsed['x-site-deployment-id'] ||
          parsed['was-default-hostname'] ||
          parsed['x-arr-log-id']
      )
    } catch {
      /* ignore */
    }
  }
  if (!hasAzureMarkers) return false

  if (ip.startsWith('127.') || ip === '::1') return true

  const ua = (input.userAgent || '').trim()
  if (!ua && !(input.referrer || '').trim()) return true

  return false
}
