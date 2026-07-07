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

const TRAVERSAL_RE =
  /\.\.(?:\/|\\)|%2e%2e|%252e|\.%2e|\.\.%2f|(?:^|\/)\w+\.\.(?:\/|$)|%25c0%25af|%c0%af/i
// Encoded quote/apostrophe prefix (e.g. /%22/_next/static/...) — path normalization probes.
const ENCODED_DELIMITER_PREFIX_RE = /^\/(?:%22|%2522|%27|%2527)(?:\/|$)/i
const ENCODED_DOTENV_RE =
  /(?:^|\/)%2e%65%6e%76(?:\/|$|\n)|\.%2565(?:%256e%2576|nv)|\.%65(?:%6e%76|nv)|%E2%80%8Benv/i
const SUSPICIOUS_PAYLOAD_RE =
  /(?:\bunion(?:\s+all)?\s+select\b|\bdrop\s+table\b|\binformation_schema\b|<script\b|javascript:|onerror=|onload=|cmd=|exec=|\/etc\/passwd|\.\.\/|%00|%3cscript|%3e|%27\s*or\s*%271%27=%271)/i

const GIT_RES = [
  /\/\.git(\/|$)/i,
  /\.git\/(config|HEAD|index|objects)/i,
  /(^|\/)\.gitmodules$/i,
  /(^|\/)\.github(?:\/|$)/i,
  /(^|\/)\.gitlab(?:\/|$)/i,
  /(^|\/)\.git-credentials$/i,
  /(^|\/)home\/(?:\*|[^/]+)\/\.git-credentials$/i,
  /(^|\/)\.git-secret$/i,
  /(^|\/)\.git-askpass\.sh$/i,
  /(^|\/)\.gitattributes$/i,
  /(^|\/)\.gitignore$/i,
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
  /\.npmrc(?:%23|#)/i,
  /\.dockerenv/i,
  /\.pgpass/i,
  /\.mysql_history/i,
  // Shell / REPL history files (leak secrets typed at a prompt).
  /(^|\/)\.(?:sh|zsh|fish|ksh|pry|irb|node_repl|python|php|psql|rediscli|scala)_history$/i,
  // Streamlit app secrets (/.streamlit/, /app/.streamlit/, /src/.streamlit/).
  /\.streamlit\/secrets\.toml$/i,
  /(^|\/)\.secrets\.json$/i,
  /(^|\/)api[-_]?key\.txt$/i,
  /(^|\/)manage\/env(?:\/|$)/i,
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
  /(^|\/)\.sendgrid(?:\/|\.)/i,
  /(^|\/)\.config\/sendgrid(?:\/|$)/i,
  /(^|\/)\.terraform\/credentials\.tfrc\.json$/i,
  /(^|\/)credentials\.(?:csv|go|ini|js)$/i,
  /(^|\/)config\/credentials\.ya?ml\.enc$/i,
  /(^|\/)stripe-credentials\.json$/i,
  /(^|\/)rest\/credentials-for-node$/i,
  // --- Env-file dictionary variants (Laravel/dotenv scanners) ---
  /(^|\/)env(?:[._-][\w.-]*)?$/i, // env.local, env.prod, env.save, env.cfg, env.1, env_
  /(^|\/)_{1,2}env$/i, // _env, __env
  /(^|\/)envfile$/i,
  /(^|\/)\.?dotenv$/i, // dotenv, .dotenv
  /(^|\/)environment(?:\.\w+)?$/i, // environment, environment.ts, ENVIRONMENT
  /(^|\/)application_env$/i,
  /(^|\/)app_env$/i,
  /(^|\/)\.app_env$/i,
  /(^|\/)laravel_env$/i,
  /(^|\/)(?:app|storage)\/env(?:[._-][\w.-]*)?$/i, // app/env, app/env.local, storage/env(.local)
  /(^|\/)config\/env(?:ironment)?(?:[._-][\w.-]*)?$/i, // config/env, config/environment, config/env.prod
  // --- Secret value dumps (env-var-name-as-path) ---
  /(^|\/)(?:database_url|db_password|db_pass|app_key|app_secret|secret_key|api_secret|aws_secret_access_key|aws_access_key_id|mail_password|redis_url|password|passwd|token)(?:\.txt)?$/i,
  // --- Secret text-file dumps ---
  /(^|\/)(?:passwords?|passwd|pass|users?|secrets?|credentials?|api[-_]?keys?|keys|tokens?|db|database|dotenv|log)\.txt$/i,
  // --- Shell rc / profile files ---
  /(^|\/)\.(?:bashrc|zshrc|profile|bash_profile|bash_logout|cshrc|kshrc)$/i,
  // --- Cloud CLI credential caches ---
  /(^|\/)\.s3cfg$/i,
  /(^|\/)\.boto$/i,
  /(^|\/)\.passwd-s3fs$/i,
  /(^|\/)\.firebaserc$/i,
  /(^|\/)\.amplifyrc$/i,
  /(^|\/)amplify\/team-provider-info\.json$/i,
  /(^|\/)s3(?:[-.][\w.]+|\/buckets?)$/i, // s3.key, s3.secret, s3.yaml, s3-config.json, s3/bucket(s)
  /(^|\/)ngrok\.ya?ml$/i,
  /(^|\/)\.ngrok2\//i,
  /(^|\/)vault\.ya?ml$/i,
  // --- Package-manager caches ---
  /(^|\/)\.(?:npm|yarn|pnpm)(?:\/|$)/i,
  /(^|\/)\.pnp\.js$/i,
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
  /(^|\/)aws-exports\.js$/i,
  /(^|\/)aws(?:[-_]credentials)?\.json$/i,
  /(^|\/)config\/aws\.json$/i,
  /(^|\/)secrets\/aws\.json$/i,
  /(^|\/)backend\/aws\.json$/i,
  /(^|\/)aws\//i,
  /(^|\/)aws-codecommit$/i,
  /(^|\/)aws\.properties$/i,
  /(^|\/)aws[-_]credentials\.ini$/i,
  /(^|\/)aws-ses\.json$/i,
  /(^|\/)aws_s3(?:[_-]bucket|_config\.json)?$/i,
  /(^|\/)config\/aws\.ini$/i,
  /(^|\/)s3\/credentials$/i,
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
  /(^|\/)wp-sitemap\.xml$/i,
  // Bare /wp stub — scanners fingerprint WP installs before wp-admin probes.
  /(^|\/)wp(?:\/|$)/i,
]

const PHP_RES = [
  /phpmyadmin/i,
  /\/pma\//i,
  /(^|\/)phpinfo(?:\.\w+)?(?:\/|$)/i,
  /(^|\/)info(?:\/|$)/i,
  /(^|\/)cgi-bin(?:\/|$)/i,
  /(^|\/)index\.php(?:\/|$)/i,
  /eval-stdin\.php/i,
  /(^|\/)php-cgi(?:\/|$)/i,
  /(^|\/)bin\/sh(?:\/|$)/i,
  /thinkphp/i,
  /vendor\/phpunit/i,
  /\.php(?:\d+)?$/i,
  /\.php$/i,
  // Laravel Ignition RCE (CVE-2021-3129) and Debugbar exposure probes.
  /(^|\/)_ignition(?:\/|$)/i,
  /(^|\/)_debugbar(?:\/|$)/i,
  /(^|\/)livewire\/update/i,
  /(^|\/)telescope\/api\//i,
  /(^|\/)telescope(?:\/|$)/i,
  /(^|\/)phpinfo\.php(?:%23|#)/i,
  /(^|\/)phptest\.php(?:%23|#)/i,
  /(^|\/)php\.php(?:%23|#)/i,
  // Common webshell dictionary probes (e.g. /w1php, /w2php — no dot before "php").
  /(^|\/)w\dphp(?:\/|$)/i,
  /\.cgi$/i, // any CGI endpoint probe
  /\.exe$/i, // xampp/php-cgi.exe etc.
  /(^|\/)php-fpm(?:\.d)?(?:\/[\w.-]+)?\.conf$/i, // php-fpm.conf, php-fpm.d/www.conf
  /(^|\/)php\.ini$/i, // php.ini anywhere (etc/php/.../php.ini)
  /(^|\/)laravel\.ini$/i,
  /(^|\/)php-info(?:\/|$)/i,
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
  /(^|\/)(?:demo|test(?:ing)?|backup|old|new|bk|bc|main|www)(?:\/|$)/i,
  /(^|\/)(?:oldsite|old-site|newsite|new-site)(?:\/|$)/i,
  // Drupal / CMS core folder probes (e.g. /core).
  /(^|\/)core(?:\/|$)/i,
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
  /(^|\/)actuator(?:\/|$)/i,
  /(^|\/)(?:_metrics|stats\/prometheus)(?:\/|$)/i,
  /(^|\/)metrics$/i,
  /(^|\/)queue\/status$/i,
  /(^|\/)_wdt\//i,
  /(^|\/)_all_dbs$/i,
  /(^|\/)cacti(?:\/|$)/i,
  /(^|\/)SetupWizard\.aspx/i,
  /(^|\/)global-protect\/login\.esp$/i,
  /(^|\/)mgmt\/shared\/authn\/login$/i,
  /(^|\/)remote\/login$/i,
  /(^|\/)etc\/(?:passwd|nginx\/nginx\.conf)$/i,
  /(^|\/)ssl\.key$/i,
  /(^|\/)rest\/default\/V1\//i,
  /(^|\/)modules\/ps_/i,
  /(^|\/)config\.(?:js|json)(?:%23|#)/i,
  /(^|\/)(?:database|mysql|db|site)\.sql(?:%23|#)/i,
  /(^|\/)web\.config(?:%23|#)/i,
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
  /(^|\/)config\.toml$/i,
  /(^|\/)docker-compose(?:\.[^.\/]+)?\.ya?ml$/i,
  /(^|\/)docker-compose[\w.-]*\.(?:ya?ml|json)(?:%23|#)/i,
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
  /(^|\/)META-INF\/(?:context\.xml|MANIFEST\.MF)$/i,
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
  // Extended SendGrid / dependency-tree scanner probes.
  /sendgrid/i,
  /(^|\/)node_modules\/@sendgrid\//i,
  /(^|\/)vendor\/sendgrid\//i,
  /(^|\/)__mocks__\/@sendgrid/i,
  /(^|\/)site-packages\/sendgrid/i,
  /(^|\/)gems\/sendgrid/i,
  /(^|\/)infra\/sendgrid\.tf$/i,
  /(^|\/)terraform\/sendgrid\.tf$/i,
  /(^|\/)playbooks\/configure_sendgrid\.ya?ml$/i,
  /(^|\/)logs\/sendgrid\.log$/i,
  /(^|\/)tmp\/sendgrid_debug\.log$/i,
  /(^|\/)var\/log\/sendgrid/i,
  /(^|\/)usr\/local\/(?:bin\/sendgrid|lib\/sendgrid)/i,
  /(^|\/)internal\/email\/sendgrid\.go$/i,
  /(^|\/)pkg\/mailer\/sendgrid\.go$/i,
  /(^|\/)app\/services\/sendgrid_service\.rb$/i,
  /(^|\/)config\/initializers\/(?:sendgrid|aws)\.rb$/i,
  /(^|\/)config\/sendgrid\.ts$/i,
  /(^|\/)src\/(?:config\/sendgrid\.config\.ts|services\/sendgrid\.service\.ts|utils\/sendgrid\.ts)$/i,
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
  // --- System / OS file LFI probes ---
  /(^|\/)(?:etc|proc|sys)\//i, // /etc/*, /proc/*, /sys/* (passwd, shadow, environ, resolv.conf, nginx/apache/php/cron/mail configs)
  /(^|\/)windows\/(?:win|system)\.ini$/i,
  /(^|\/)boot\.ini$/i,
  /(^|\/)shadow$/i,
  /(^|\/)cron\/crontab$/i,
  /(^|\/)\.vagrant\//i,
  // --- Log / dump files ---
  /\.log$/i,
  /(^|\/)error_log$/i,
  // --- Ruby / Salt / Python / Terraform / IaC ---
  /\.rb$/i,
  /\.sls$/i,
  /\.py$/i,
  /\.tf$/i,
  /(^|\/)\.?terraform(?:[.\/]|$)/i, // .terraform, terraform/, .terraform.tfstate, .terraform.lock.hcl
  /(^|\/)terraform\.tfvars\.json$/i,
  /(^|\/)Vagrantfile$/i,
  /(^|\/)Makefile$/i,
  /(^|\/)Dockerfile$/i,
  /(^|\/)\.dockerignore$/i,
  /(^|\/)ansible\/[\w.-]+\.ya?ml$/i,
  /(^|\/)(?:k8s|kubernetes)\/[\w.-]+\.ya?ml$/i,
  /(^|\/)supervisord?\.conf$/i,
  /(^|\/)supervisor\/[\w.-]+\.conf$/i,
  /(^|\/)httpd\.conf$/i,
  /(^|\/)conf\.d\/[\w.-]+\.conf$/i,
  /(^|\/)mailcow\.conf$/i,
  /(^|\/)config\/mail\.\w+$/i,
  /(^|\/)config\/storage\.ya?ml$/i,
  /(^|\/)config\/initializers\//i,
  // --- Laravel / framework build & config artifacts ---
  /(^|\/)artisan$/i,
  /(^|\/)(?:composer|package)(?:-lock)?\.json$/i,
  /(^|\/)(?:composer\.lock|yarn\.lock)$/i,
  /(^|\/)phpunit\.xml(?:\.dist)?$/i,
  /(^|\/)\.phpunit(?:\.result)?\.cache$/i,
  /(^|\/)\.user\.ini$/i,
  /(^|\/)(?:vite|webpack\.mix|craco|next|nuxt)\.config\.(?:js|mjs|cjs|ts)$/i,
  /(^|\/)webpack\.mix\.js$/i,
  /(^|\/)ormconfig\.json$/i,
  /(^|\/)netlify\.toml$/i,
  /(^|\/)mix-manifest\.json$/i,
  /(^|\/)laravel(?:[._]config)?$/i, // laravel, laravel.config, laravel_config
  /(^|\/)(?:app\.config|app_config|\.app_config)$/i,
  /(^|\/)settings\.php\.save$/i,
  /(^|\/)application-\w+\.ya?ml$/i, // application-prod.yml, application-staging.yml, ...
  /(^|\/)web\.(?:release|debug)\.config$/i,
  /(^|\/)joomla\.xml$/i,
  /(^|\/)app\/etc\/local\.xml$/i, // Magento
  /(^|\/)elmah\.axd$/i,
  /(^|\/)schema\.prisma$/i,
  /(^|\/)(?:sam-)?template\.ya?ml$/i,
  /(^|\/)outputs\.tf$/i,
  /(^|\/)s3-config\.json$/i,
  /(^|\/)storage\/(?:telescope|debugbar|framework|app|logs)(?:\/|$)/i,
  // --- Stripe / payment secret files ---
  /(^|\/)stripe(?:[-.][\w.]+)?\.(?:json|ya?ml|js|ts)$/i,
  /(^|\/)stripe-keys\.json$/i,
  /(^|\/)\.stripe$/i,
  /\.well-known\/stripe/i,
  // --- Container / infra API + port-in-path probes ---
  /(^|\/):\d{2,5}(?:\/|$)/i, // /:2375, /:27017/...
  /(^|\/)v\d+(?:\.\d+)?\/(?:keys|secrets)(?:\/|$)/i,
  // --- n8n / REST scanner probes (app uses /api, not /rest) ---
  /(^|\/)rest\//i,
  // --- Mgmt / ops consoles ---
  /(^|\/)balancer-manager$/i,
  /(^|\/)server-info$/i,
  /(^|\/)manager\/html(?:[;?]|$)/i,
  /(^|\/)host-manager\/html(?:[;?]|$)/i,
  /(^|\/)console(?:\/|$)/i,
  /(^|\/)admin\/debug(?:\/|$)/i,
  /(^|\/)__nextjs_original-stack-frame(?:\/|$)/i,
  /(^|\/)server\.js(?:$|[?;])/i,
  /(^|\/)aspnet_client(?:~|$|\/)/i,
  /(^|\/)solr\/admin(?:\/|$)/i,
  /(^|\/)package-updates(?:\/|$)/i,
  // --- Source maps (root-served; _next is excluded from middleware) ---
  /(^|\/)static\/[\w./-]+\.map$/i,
  /(^|\/)app\.js\.map$/i,
  // --- Double-encoded profiler/debug probes ---
  /%255f/i, // %255f = double-encoded underscore (e.g. /%255fprofiler)
  /(^|\/)__debug_{0,2}$/i, // __debug, __debug_, __debug__
  /(^|\/)swagger\.json$/i,
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