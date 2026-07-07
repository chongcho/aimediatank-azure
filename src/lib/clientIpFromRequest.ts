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

/** Azure Always On / platform health pings — not useful in access logs. */
export function isLikelyAzurePlatformPing(input: {
  headers: Headers
  clientIp: string | null
  pathname: string
  userAgent?: string | null
}): boolean {
  const { headers, clientIp, pathname, userAgent } = input
  if (!clientIp || !isPrivateClientIp(clientIp)) return false
  if (pathname !== '/' && pathname !== '/api/health') return false
  if ((userAgent || '').trim()) return false
  if (!headers.get('x-site-deployment-id') && !headers.get('was-default-hostname')) return false
  return true
}
