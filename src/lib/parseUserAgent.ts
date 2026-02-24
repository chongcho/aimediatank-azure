/**
 * Minimal user-agent parsing for access logs (browser, OS, device).
 * No external dependency; good enough for analytics/support.
 */
export function parseUserAgent(ua: string | null | undefined): { browser: string | null; os: string | null; device: string | null } {
  if (!ua || typeof ua !== 'string') return { browser: null, os: null, device: null }
  const s = ua.substring(0, 500)

  let browser: string | null = null
  if (s.includes('Edg/')) browser = 'Edge'
  else if (s.includes('OPR/') || s.includes('Opera')) browser = 'Opera'
  else if (s.includes('Chrome/')) browser = 'Chrome'
  else if (s.includes('Safari/') && !s.includes('Chrome')) browser = 'Safari'
  else if (s.includes('Firefox/')) browser = 'Firefox'
  else if (s.includes('MSIE') || s.includes('Trident/')) browser = 'IE'

  let os: string | null = null
  if (s.includes('Windows NT')) os = 'Windows'
  else if (s.includes('Mac OS X') || s.includes('Macintosh')) os = 'macOS'
  else if (s.includes('Linux')) os = 'Linux'
  else if (s.includes('Android')) os = 'Android'
  else if (s.includes('iPhone') || s.includes('iPad')) os = 'iOS'

  let device: string | null = null
  if (s.includes('Mobile') && !s.includes('iPad')) device = 'Mobile'
  else if (s.includes('Tablet') || s.includes('iPad')) device = 'Tablet'
  else device = 'Desktop'

  return { browser, os, device }
}
