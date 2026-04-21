/**
 * Path/method probe detection (Edge-safe, no DB). Shared by middleware and access logging.
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
  /(^|\/)\.netrc$/i,
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
  /\/wp-json(\/|$)/i, // WP REST API — scanners hit this even on non-WP sites
  /wp-config/i, // wp-config.php / backups — credential probe
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
  /(^|\/)config\/(?:secrets|database)\.ya?ml$/i,
  /\/_profiler(\/|$)/i,
  /\.sql$/i,
  /\.bak$/i,
  /\.old$/i,
  /backup\.(sql|zip|tar|gz)/i,
  /web\.config$/i,
  /\/\.kube\//i,
  /\/\.docker\//i,
  /\/actuator\//i,
  /\/debug\/default(\/|$)/i, // Yii2 debug module (e.g. /debug/default/view)
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
