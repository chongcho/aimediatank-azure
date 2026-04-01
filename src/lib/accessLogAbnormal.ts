/**
 * Classify access log lines that are likely automated probes / abuse (not normal browsing).
 * Used when persisting SiteAccessLog and optional ADMIN_ACCESS_SECURITY_EMAIL alerts.
 */

export const ABNORMAL_FLAG_LABELS: Record<string, string> = {
  PROBE_GIT: 'Repository / .git probe',
  PROBE_ENV: 'Secrets / .env or key file probe',
  PROBE_AWS: 'AWS credentials path probe',
  PROBE_WP: 'WordPress probe',
  PROBE_PHP: 'PHP / admin panel probe',
  PROBE_CONFIG: 'Config / backup / infra probe',
  PATH_TRAVERSAL: 'Path traversal pattern',
  SUSPICIOUS_METHOD: 'Unusual HTTP method',
  LEAK_SUSPECTED: 'Probe path returned success (verify server config)',
}

function decodePathSegment(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

const TRAVERSAL_RE = /\.\.(?:\/|\\)|%2e%2e|%252e|\.%2e|\.\.%2f/i

const GIT_RES = [/\/\.git(\/|$)/i, /\.git\/(config|HEAD|index|objects)/i]

const ENV_RES = [
  /\.env/i,
  /\.env\./i,
  /(^|\/)aws\.env$/i,
  /\.pem(\/|$)/i,
  /id_rsa/i,
  /\.htpasswd/i,
  /\.htaccess/i,
  /\.npmrc$/i,
  /\.dockerenv/i,
  /\.pgpass/i,
  /\.mysql_history/i,
]

const AWS_RES = [/\/\.aws\//i, /\.aws\/credentials/i, /credentials\.aws/i]

const WP_RES = [
  /wp-admin/i,
  /wp-login/i,
  /wp-content/i,
  /wp-includes/i,
  /xmlrpc\.php/i,
  /wlwmanifest\.xml/i,
  /wordpress/i,
]

const PHP_RES = [
  /phpmyadmin/i,
  /\/pma\//i,
  /phpinfo/i,
  /\/cgi-bin\//i,
  /eval-stdin\.php/i,
  /thinkphp/i,
  /vendor\/phpunit/i,
  /\.php$/i,
]

const CONFIG_RES = [
  /\.sql$/i,
  /\.bak$/i,
  /\.old$/i,
  /backup\.(sql|zip|tar|gz)/i,
  /web\.config$/i,
  /\/\.kube\//i,
  /\/\.docker\//i,
  /\/actuator\//i,
  /\/server-status$/i,
  /\/\.svn\//i,
  /\/\.hg\//i,
]

function matchesAny(path: string, res: RegExp[]): boolean {
  return res.some((re) => re.test(path))
}

/**
 * Returns stable detection codes for this request (empty if nothing suspicious).
 */
export function detectAbnormalAccess(input: {
  path: string
  method?: string
  statusCode?: number | null
}): string[] {
  const raw = (input.path || '').split('?')[0] || ''
  const lower = raw.toLowerCase()
  const decoded = decodePathSegment(lower)
  const check = `${lower}\n${decoded}`

  const flags = new Set<string>()

  if (TRAVERSAL_RE.test(raw) || TRAVERSAL_RE.test(decoded)) {
    flags.add('PATH_TRAVERSAL')
  }

  if (matchesAny(check, GIT_RES)) flags.add('PROBE_GIT')
  if (matchesAny(check, ENV_RES)) flags.add('PROBE_ENV')
  if (matchesAny(check, AWS_RES)) flags.add('PROBE_AWS')
  if (matchesAny(check, WP_RES)) flags.add('PROBE_WP')
  if (matchesAny(check, PHP_RES)) flags.add('PROBE_PHP')
  if (matchesAny(check, CONFIG_RES)) flags.add('PROBE_CONFIG')

  const method = (input.method || 'GET').toUpperCase()
  if (method === 'TRACE' || method === 'CONNECT') {
    flags.add('SUSPICIOUS_METHOD')
  }
  if (method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    if (
      matchesAny(check, [...GIT_RES, ...ENV_RES, ...AWS_RES, ...WP_RES, ...PHP_RES, ...CONFIG_RES]) ||
      flags.size > 0
    ) {
      flags.add('SUSPICIOUS_METHOD')
    }
  }

  const sc = input.statusCode
  if (sc != null && sc >= 200 && sc < 300) {
    const probeOnly = new Set(flags)
    probeOnly.delete('SUSPICIOUS_METHOD')
    probeOnly.delete('PATH_TRAVERSAL')
    if (probeOnly.size > 0) {
      flags.add('LEAK_SUSPECTED')
    }
  }

  return Array.from(flags).sort()
}

function flagSummaryHtml(flags: string[]): string {
  return flags
    .map((f) => {
      const label = ABNORMAL_FLAG_LABELS[f] || f
      return `<li><code>${escapeHtml(f)}</code> — ${escapeHtml(label)}</li>`
    })
    .join('')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Sends at most one email per UTC hour (all abnormal types combined) to avoid inbox floods from scanners.
 * Set ADMIN_ACCESS_SECURITY_EMAIL to enable. Requires Azure Communication Services email (sendEmail).
 */
export async function maybeNotifyAbnormalAccess(params: {
  flags: string[]
  path: string
  method: string
  ipAddress: string | null
  country: string | null
  city: string | null
}): Promise<void> {
  const to = process.env.ADMIN_ACCESS_SECURITY_EMAIL?.trim()
  if (!to || params.flags.length === 0) return

  const { prisma } = await import('@/lib/prisma')
  const { sendEmail } = await import('@/lib/email')

  const hourBucket = new Date().toISOString().slice(0, 13)
  const bucket = `access_security:${hourBucket}`

  try {
    await prisma.securityAccessAlertDedup.create({ data: { bucket } })
  } catch {
    return
  }

  const sent = await sendEmail({
    to,
    subject: `[AI Media Tank] Abnormal access detected`,
    html: `
        <p>An access request matched <strong>abnormal / security-related</strong> patterns (example below).</p>
        <p><strong>Flags:</strong></p>
        <ul>${flagSummaryHtml(params.flags)}</ul>
        <p><strong>Path:</strong> <code>${escapeHtml(params.path)}</code><br/>
        <strong>Method:</strong> ${escapeHtml(params.method)}<br/>
        <strong>IP:</strong> ${escapeHtml(params.ipAddress || '—')}<br/>
        <strong>Location:</strong> ${escapeHtml([params.city, params.country].filter(Boolean).join(', ') || '—')}</p>
        <p style="color:#666;font-size:12px">At most <strong>one</strong> alert email per UTC hour for all abnormal traffic. Open Admin → Access Logs and enable <strong>Abnormal only</strong> for the full list.</p>
      `,
  })
  if (!sent) {
    await prisma.securityAccessAlertDedup.delete({ where: { bucket } }).catch(() => {})
  }
}
