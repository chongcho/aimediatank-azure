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
  EMPTY_USER_AGENT: 'Missing User-Agent header',
  LONG_QUERY_PAYLOAD: 'Unusually long query payload',
  SUSPICIOUS_QUERY_PAYLOAD: 'Suspicious query payload',
  SUSPICIOUS_REFERRER: 'Suspicious referrer payload',
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
// Encoded quote/apostrophe prefix (e.g. /%22/_next/static/...) — path normalization probes.
const ENCODED_DELIMITER_PREFIX_RE = /^\/(?:%22|%2522|%27|%2527)(?:\/|$)/i
const ENCODED_DOTENV_RE =
  /(?:^|\/)%2e%65%6e%76(?:\/|$|\n)|\.%2565(?:%256e%2576|nv)|\.%65(?:%6e%76|nv)/i
const SUSPICIOUS_PAYLOAD_RE =
  /(?:\bunion(?:\s+all)?\s+select\b|\bdrop\s+table\b|\binformation_schema\b|<script\b|javascript:|onerror=|onload=|cmd=|exec=|\/etc\/passwd|\.\.\/|%00|%3cscript|%3e|%27\s*or\s*%271%27=%271)/i

const GIT_RES = [
  /\/\.git(\/|$)/i,
  /\.git\/(config|HEAD|index|objects)/i,
  /(^|\/)\.gitmodules$/i,
]

const ENV_RES = [
  /\.env/i,
  /\.env\./i,
  /(^|\/)env\.json$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)aws\.env$/i,
  /\.pem(\/|$)/i,
  /id_rsa/i,
  /id_ecdsa/i,
  /id_dsa/i,
  /id_ed25519/i,
  /authorized_keys/i,
  /known_hosts/i,
  /\.htpasswd/i,
  /\.htaccess/i,
  /\.npmrc$/i,
  /\.dockerenv/i,
  /\.pgpass/i,
  /\.mysql_history/i,
  // GCP / Firebase credential dumps (common scanner dictionary).
  /(^|\/)application_default_credentials\.json$/i,
  /(^|\/)firebase-adminsdk\.json$/i,
  /(^|\/)firebase-credentials\.json$/i,
  /(^|\/)firebase-service-account\.json$/i,
  /(^|\/)firebase\.json$/i,
  /(^|\/)gcp-service-account\.json$/i,
  /(^|\/)gcp-credentials\.json$/i,
  /(^|\/)google-credentials\.json$/i,
  /(^|\/)google-service-account\.json$/i,
  /(^|\/)client_secrets\.json$/i,
  /(^|\/)client_secret\.json$/i,
  /(^|\/)keyfile\.json$/i,
  /(^|\/)key\.json$/i,
  /(^|\/)sa-key\.json$/i,
  /(^|\/)service-account\.json$/i,
  /(^|\/)config\/service-account\.json$/i,
  /(^|\/)env\.txt$/i,
  /(^|\/)env\.backup$/i,
  /^\/env\n/i,
  /\/etc\/environment(?:\/|$)/i,
  // Exact /credentials only — not /api/auth/callback/credentials.
  /^\/credentials\n/i,
  /(^|\/)credentials\.ya?ml$/i,
  /(^|\/)\.credentials(?:\/|$)/i,
  /(^|\/)api_keys\.json$/i,
  /(^|\/)gcp\.json$/i,
  /(^|\/)secrets\/gcp\.json$/i,
  /(^|\/)serviceaccount\.json$/i,
  /(^|\/)\.azure\/credentials$/i,
  /(^|\/)\.config\/gcloud\/credentials\.db$/i,
  /(^|\/)secrets\/azure\.json$/i,
  /(^|\/)api-keys\.json$/i,
  /(^|\/)api_keys\.ya?ml$/i,
  /(^|\/)keys\.json$/i,
  /(^|\/)config\/keys\.json$/i,
  /(^|\/)private\.json$/i,
  /(^|\/)secret\.json$/i,
  /(^|\/)(?:private|server)\.key$/i,
  /(^|\/)cloud\.json$/i,
  /(^|\/)\.pypirc$/i,
  /(^|\/)\.bash_history$/i,
  /(^|\/)\.gitconfig$/i,
]

const AWS_RES = [
  /\/\.aws\//i,
  /\.aws\/credentials/i,
  /credentials\.aws/i,
  // Scanners probe YAML named like AWS exports (not the same as /.aws/credentials).
  /(^|\/)aws\.ya?ml$/i,
  /(^|\/)config\/aws\.ya?ml$/i,
  /(^|\/)aws-secret\.ya?ml$/i,
  /(^|\/)aws[-.]config\.js$/i,
  /(^|\/)aws(?:[-_]credentials)?\.json$/i,
  /(^|\/)config\/aws\.json$/i,
  /(^|\/)secrets\/aws\.json$/i,
  /(^|\/)backend\/aws\.json$/i,
]

const WP_RES = [
  /wp-admin/i,
  /wp-login/i,
  /wp-content/i,
  /wp-includes/i,
  /(^|\/)wp-old(?:\/|$)/i,
  /\/wp-json(\/|$)/i, // WP REST API — scanners hit this even on non-WP sites
  /wp-config/i, // wp-config.php / backups — credential probe
  /xmlrpc\.php/i,
  /wlwmanifest\.xml/i,
  /wordpress/i,
]

const PHP_RES = [
  /phpmyadmin/i,
  /\/pma\//i,
  /(^|\/)phpinfo(?:\.php)?(?:\/|$)/i,
  /(^|\/)info(?:\/|$)/i,
  /(^|\/)cgi-bin(?:\/|$)/i,
  /(^|\/)index\.php(?:\/|$)/i,
  /eval-stdin\.php/i,
  /thinkphp/i,
  /vendor\/phpunit/i,
  /\.php(?:\d+)?$/i,
  /\.php$/i,
  // Laravel Ignition RCE (CVE-2021-3129) and Debugbar exposure probes.
  /(^|\/)_ignition(?:\/|$)/i,
  /(^|\/)_debugbar(?:\/|$)/i,
]

const CONFIG_RES = [
  /(^|\/)_environment(?:\/|$)/i,
  /(^|\/)config\.js$/i,
  /(^|\/)settings\.json$/i,
  /(^|\/)runtime-config\.js$/i,
  /(^|\/)graphql(?:\/|$)/i,
  /(^|\/)terraform\.tfvars$/i,
  /(^|\/)serverless\.ya?ml$/i,
  /(^|\/)asset-manifest\.json$/i,
  /(^|\/)build-manifest\.json$/i,
  /(^|\/)config\/(?:secrets|database)\.(?:ya?ml|json)$/i,
  /(^|\/)\.gitlab-ci(?:\.ya?ml)?(?:\/|$)/i,
  /(^|\/)terraform\.tfstate(?:\.backup)?$/i,
  /(^|\/)appsettings(?:\.[^.\/]+)?\.json$/i,
  /(^|\/)application\.ya?ml$/i,
  /(^|\/)application\.properties$/i,
  /(^|\/)\.anthropic\/config\.json$/i,
  /(^|\/)serviceaccountkey\.json$/i,
  /(^|\/)\.openai\/config\.json$/i,
  /(^|\/)credentials\.json$/i,
  /(^|\/)\.cursor\/mcp\.json$/i,
  /(^|\/)secrets\.json$/i,
  /\/_profiler(\/|$)/i,
  /\.sql$/i,
  /\.bak$/i,
  /\.old$/i,
  /backup\.(sql|zip|tar|gz)/i,
  // Common dictionary-style recon endpoints hit in case-variant bursts.
  /(^|\/)(?:demo|test|backup|old|new|bk|bc|main|www)(?:\/|$)/i,
  /(^|\/)(?:oldsite|old-site)(?:\/|$)/i,
  /(^|\/)20(?:1[7-9]|2[0-4])(?:\/|$)/i,
  // Common scanner probes for downloadable backup dumps.
  /(^|\/)(?:db|web|website|site|public_html|htdocs|www|backup(?:[_-]?(?:full|tpl|2))?|backups?|archive|old|bak|bkp|back|7bk)(?:[_-][^\/]+)?\.(?:zip|tar(?:\.gz)?|tgz|gz)$/i,
  // Site-specific archive probes (aimediatank*.zip/rar/tar.gz variants).
  /(^|\/)aimediatank(?:\.com)?(?:[_\-.][^\/]*)?\.(?:zip|rar|tar(?:\.gz)?|tgz|gz)$/i,
  // WordPress-style upload dir and generic scanner stubs.
  /(^|\/)uploads(?:\/|$)/i,
  /(^|\/)blank-\d+(?:\/|$)/i,
  // Non-standard .well-known probes (keep openid-configuration / assetlinks.json reachable).
  /\/\.well-known\/connection-check(?:\/|$)/i,
  /web\.config$/i,
  /\/\.kube\//i,
  /(^|\/)\.?(?:kube)?config$/i, // kubeconfig / .kubeconfig probes
  /\/\.docker\//i,
  /\/actuator\//i,
  /\/(?:readyz|healthz|health|manage(?:ment)?)$/i, // Spring/ops health probes
  /\/applicationhost\.config$/i,
  /\/nuget\.config$/i,
  /\/local\.settings\.json$/i,
  /\/properties\/launchsettings\.json$/i,
  /\/sftp-config\.json$/i,
  /(^|\/)\.vscode(?:\/|$)/i,
  /\/\.composer\/auth\.json$/i,
  /\/(?:swagger(?:\/index\.html)?|openapi(?:\/v\d+)?(?:\/?[^\/]*)?|v3\/api-docs|redoc|scalar|docs)(?:\/|$)/i, // API-doc scanner probes
  /\/debug\/default(\/|$)/i, // Yii2 debug module (e.g. /debug/default/view)
  /\/server-status$/i,
  /\/\.svn\//i,
  /\/\.hg\//i,
  // Symfony / PHP-app config probes (common in credential scanners).
  /(^|\/)symfony(?:\/|$)/i,
  /(^|\/)app\/config\.ya?ml$/i,
  /(^|\/)app\/config\/[^/]+\.ya?ml$/i,
  /(^|\/)config\.json$/i,
  /(^|\/)config\.json\.(?:save|bak|old|backup|swp|tmp)$/i,
  /(^|\/)config\.ya?ml$/i,
  /(^|\/)docker-compose[\w.-]*\.(?:ya?ml|json)$/i,
  /(^|\/)configuration\.ya?ml$/i,
  /(^|\/)database\.ya?ml$/i,
  /(^|\/)app\/parameters\.ya?ml$/i,
  /(^|\/)\.github\/workflows\//i,
  /(^|\/)helm\/values(?:-[\w-]+)?\.ya?ml$/i,
  /(^|\/)(?:configprops|heapdump|threaddump|dump|logfile)(?:\/|$)/i,
  /(^|\/)trace(?:\/|$)/i,
  /(^|\/)db\.sql\.gz$/i,
  /(^|\/)backend\/settings\.py$/i,
  /(^|\/)exports\/sendgrid\.zip$/i,
  /(^|\/)sendgrid(?:-config)?\.zip$/i,
  /(^|\/)smtp\.zip$/i,
  // CI/CD and IDE config probes (credential scanners).
  /(^|\/)\.(?:travis|drone)\.ya?ml$/i,
  /(^|\/)\.buildkite\/pipeline\.ya?ml$/i,
  /(^|\/)azure-pipelines\.ya?ml$/i,
  /(^|\/)bitbucket-pipelines\.ya?ml$/i,
  /(^|\/)Jenkinsfile$/i,
  /(^|\/)jenkins\/Jenkinsfile$/i,
  /(^|\/)\.idea\/(?:WebServers|dataSources(?:\.local)?|deployment|workspace)\.xml$/i,
  /(^|\/)Dockerfile$/i,
  /(^|\/)nginx\.conf(?:ig)?$/i,
  /(^|\/)(?:k8s|kubernetes)\.ya?ml$/i,
  /(^|\/)app\.(?:ya?ml|json)$/i,
  /(^|\/)WEB-INF\/(?:web\.xml|context\.xml)$/i,
  /(^|\/)META-INF\/context\.xml$/i,
  /(^|\/)server\.xml$/i,
  // SendGrid credential / export probes.
  /(^|\/)sendgrid[\w.-]*\.(?:js|json|py|ya?ml|zip)$/i,
  /(^|\/)(?:app|assets\/js|backend|config|email|js|mail|mailer|public\/js|src|static\/js)\/sendgrid\.(?:js|py)$/i,
  /(^|\/)sendgrid[-_]?(?:config|export|helper|min)(?:\.[\w]+)?$/i,
  // Python / Symfony-style settings and parameters probes.
  /(^|\/)settings(?:\/(?:base|local|production))?\.py$/i,
  /(^|\/)(?:core|project|src|backend)\/settings\.py$/i,
  /(^|\/)parameters\.ya?ml$/i,
  /(^|\/)database\.(?:json|ini)$/i,
  /(^|\/)db\.(?:json|ya?ml)$/i,
  /(^|\/)secrets?\.ya?ml$/i,
  /(^|\/)configuration\.json$/i,
  /(^|\/)application\.json$/i,
  /(^|\/)config\.ini$/i,
  /(^|\/)settings\.(?:ini|ya?ml)$/i,
  /(^|\/)profiler(?:\/|$)/i,
  // Log file and dump probes.
  /(^|\/)(?:access|app|application|debug|error|server|trace)\.log$/i,
  /(^|\/)logs?\/(?:app|application|debug|error|laravel)\.log$/i,
  /(^|\/)storage\/logs\/laravel\.log$/i,
  /(^|\/)laravel\.log$/i,
  /(^|\/)dump\.(?:sql\.gz|zip)$/i,
  /(^|\/)(?:email|mail|mailer)\.zip$/i,
  /(^|\/)vercel\.json$/i,
  /(^|\/)amplify\.ya?ml$/i,
  /(^|\/)var\/task(?:\/|$)/i,
  /(^|\/)public\/stripe\.js$/i,
  // CMS / legacy app-server fingerprint probes.
  /(^|\/)magento_version(?:\/|$)/i,
  /(^|\/)media\/system(?:\/|$)/i,
  /(^|\/)administrator(?:\/|$)/i,
  /\.jsp(?:\/|$)/i,
  // Generic CMS / scanner stub paths (no app routes at these URLs).
  /^\/home\n/i,
  /^\/page\n/i,
  // Random underscore web-shell style probes (e.g. /_rNd9xZ7kL3); min 10 chars skips /_next.
  /(^|\/)_[a-z0-9]{10,}(?:\/|$)/i,
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
  query?: string | null
  referrer?: string | null
  userAgent?: string | null
}): string[] {
  const raw = (input.path || '').split('?')[0] || ''
  const lower = raw.toLowerCase()
  const decoded = decodePathSegment(lower)
  const check = `${lower}\n${decoded}`

  const flags = new Set<string>()

  if (TRAVERSAL_RE.test(raw) || TRAVERSAL_RE.test(decoded)) {
    flags.add('PATH_TRAVERSAL')
  }
  if (ENCODED_DELIMITER_PREFIX_RE.test(raw) || ENCODED_DELIMITER_PREFIX_RE.test(lower)) {
    flags.add('PATH_TRAVERSAL')
  }
  if (
    ENCODED_DOTENV_RE.test(raw) ||
    ENCODED_DOTENV_RE.test(lower) ||
    ENCODED_DOTENV_RE.test(decoded) ||
    ENCODED_DOTENV_RE.test(check)
  ) {
    flags.add('PROBE_ENV')
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

  if (input.userAgent !== undefined && input.userAgent !== null) {
    const ua = String(input.userAgent).trim()
    if (!ua) flags.add('EMPTY_USER_AGENT')
  }

  if (input.query !== undefined && input.query !== null) {
    const query = String(input.query).trim()
    if (query.length >= 400) flags.add('LONG_QUERY_PAYLOAD')
    if (query && SUSPICIOUS_PAYLOAD_RE.test(query)) flags.add('SUSPICIOUS_QUERY_PAYLOAD')
  }

  if (input.referrer !== undefined && input.referrer !== null) {
    const referrer = String(input.referrer).trim()
    if (referrer && SUSPICIOUS_PAYLOAD_RE.test(referrer)) flags.add('SUSPICIOUS_REFERRER')
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