# Detailed Security Assessment — AI Media Tank (AiM) (Azure)

**Assessment date:** March 5, 2026  
**Scope:** aimediatank-azure codebase (Next.js 14, Prisma/PostgreSQL, NextAuth, Stripe, Azure)

**Code fixes have been applied.** See **SECURITY_IMPROVEMENTS_ACTIONS.md** for required env vars and manual steps.

---

## Executive Summary

The application has solid foundations (NextAuth, bcrypt, Prisma, Stripe webhook verification, security headers) but contains **several critical and high-severity issues** that should be addressed before or immediately after production use. The most urgent are: a **hardcoded admin-setup secret**, **cron endpoint that does not enforce authentication**, **unauthenticated admin/migration endpoints**, **information disclosure via a test endpoint**, and **dependency vulnerabilities** (including critical Next.js CVEs).

---

## 1. Critical Findings

### 1.1 Hardcoded Admin Setup Secret (CRITICAL)

| Item | Detail |
|------|--------|
| **Location** | `src/app/api/admin/set-admin/route.ts` |
| **Issue** | Secret `'AIMEDIATANK_ADMIN_SETUP_2026'` is hardcoded. Any party that knows this value can POST with an arbitrary `email` to grant that user the `ADMIN` role. No session or other authentication. |
| **Impact** | Full privilege escalation; attacker can create admins at will. |
| **Evidence** | Lines 10–12: `if (secret !== 'AIMEDIATANK_ADMIN_SETUP_2026')` |

**Recommendation:**

- **Immediate:** Remove this route from production (or delete the file after one-time use, as the comment states). If you must keep it temporarily, require a strong secret from environment (e.g. `ADMIN_SETUP_SECRET`) and ensure it is not committed.
- **Ongoing:** Prefer creating initial admins via database/script or a one-time deploy-time step, not a long-lived HTTP endpoint.

---

### 1.2 Cron Send-Reminders Does Not Enforce Authentication (CRITICAL)

| Item | Detail |
|------|--------|
| **Location** | `src/app/api/cron/send-reminders/route.ts` |
| **Issue** | When `Authorization !== Bearer ${CRON_SECRET}`, the handler only logs a warning and **continues execution**. Reminder logic runs without authentication. |
| **Impact** | Anyone can trigger reminder emails and notifications by calling `GET/POST /api/cron/send-reminders`. Abuse can lead to spam and data disclosure (e.g. who has expiring purchases). |

**Evidence (lines 12–16):**

```ts
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  // Allow without auth for testing, but log warning
  console.log('Warning: Cron job called without proper authorization')
}
// ... execution continues
```

**Recommendation:** Enforce auth the same way as `process-videos` and `cleanup`: return `401 Unauthorized` when the secret is missing or does not match. Use a shared helper for cron auth to avoid drift.

---

### 1.3 Cron Endpoints Open When CRON_SECRET Is Unset (HIGH)

| Item | Detail |
|------|--------|
| **Location** | `src/app/api/cron/process-videos/route.ts`, `src/app/api/cron/cleanup/route.ts` |
| **Issue** | Auth check is `if (cronSecret && ...)`. When `CRON_SECRET` is not set, the condition is false and the endpoint is **fully open**. |
| **Impact** | In misconfigured or dev deployments, anyone can trigger video processing and cleanup (data loss / abuse). |

**Recommendation:** Require `CRON_SECRET` in production. If it is missing, return 503 or 401 and do not run cron logic. Consider failing app startup in production when `CRON_SECRET` is absent.

---

## 2. High-Risk Findings

### 2.1 Test Env Endpoint Exposes Configuration Metadata (HIGH)

| Item | Detail |
|------|--------|
| **Location** | `src/app/api/test/env/route.ts` |
| **Issue** | GET returns which env keys exist (e.g. SMTP_*, DATABASE_*, NEXTAUTH_*, STRIPE_*) and total env count. No authentication. |
| **Impact** | Information disclosure: attackers learn which services are configured and can target attacks (e.g. NEXTAUTH/STRIPE present). |

**Recommendation:** Remove this route in production or guard it with auth and restrict to development/staging (e.g. `NODE_ENV !== 'production'` or explicit allowlist).

---

### 2.2 Admin add-legal-name Unauthenticated (HIGH)

| Item | Detail |
|------|--------|
| **Location** | `src/app/api/admin/add-legal-name/route.ts` |
| **Issue** | GET runs `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "legalName" TEXT` with **no authentication**. Any client can trigger the migration. |
| **Impact** | Schema change from the internet; idempotent but bad practice and could be abused (e.g. rate/availability). |

**Recommendation:** Remove this endpoint after migration, or protect it with admin session + re-auth. Prefer one-off migrations via `prisma migrate` or deploy-time scripts.

---

### 2.3 log-access Unauthenticated and Body-Driven IP (MEDIUM–HIGH)

| Item | Detail |
|------|--------|
| **Location** | `src/app/api/admin/log-access/route.ts` |
| **Issue** | POST has no authentication. `ipAddress` is taken from the request body and used in a server-side fetch to `http://ip-api.com/json/${ip}`. |
| **Impact** | Log spoofing (fake IPs in analytics) and SSRF surface: attacker can make your server request URLs that include the supplied IP (e.g. metadata endpoints if the service ever supported them; currently ip-api.com limits impact). |

**Recommendation:** Do not use client-supplied IP for server-side outbound requests. Use the IP from the request (e.g. `x-forwarded-for` / `x-real-ip` from middleware) and pass it in a way the API trusts (e.g. server-only header or server-side context). Optionally restrict POST to an internal secret or same-origin when called from middleware.

---

### 2.4 NEXTAUTH_SECRET Fallback to Empty (MEDIUM)

| Item | Detail |
|------|--------|
| **Location** | `src/lib/adminReauthCookie.ts` line 8: `const SECRET = process.env.NEXTAUTH_SECRET || ''` |
| **Issue** | If `NEXTAUTH_SECRET` is unset, HMAC for admin re-auth cookie is signed with an empty secret, weakening integrity. |
| **Impact** | Cookie forgery or downgrade if an attacker can influence cookies; combined with other issues, could facilitate session/admin abuse. |

**Recommendation:** In production, fail fast if `NEXTAUTH_SECRET` is missing (e.g. in auth config or at startup). Do not default to `''`.

---

## 3. Dependency Vulnerabilities (npm audit)

**Summary:** 11 vulnerabilities (2 moderate, 7 high, 2 critical). Key packages:

| Package | Severity | Notes |
|---------|----------|--------|
| **next** (14.2.5) | **Critical** | Multiple CVEs: cache poisoning, DoS (image optimization, Server Actions, Server Components), authorization bypass, middleware SSRF, content injection, race condition, etc. Fix: upgrade to 14.2.35+ (or latest 14.x) per advisory. |
| **fast-xml-parser** | **Critical** | DoS (entity expansion, numeric entities, stack overflow), entity encoding bypass. Fix: `npm audit fix`. |
| **glob** | High | Command injection (CLI with shell:true). In tree via eslint-config-next. |
| **minimatch** | High | ReDoS. In tree via TypeScript ESLint / glob. |
| **preact** | High | JSON VNode injection. |
| **ajv** | Moderate | ReDoS with `$data`. |
| **qs** | Moderate | DoS (arrayLimit bypass). |

**Recommendations:**

- Run `npm audit` and apply `npm audit fix` where possible without breaking the build.
- Upgrade **Next.js** to a patched 14.x (e.g. 14.2.35) as a priority; verify release notes and test.
- For `npm audit fix --force` (e.g. glob/minimatch via ESLint/Next): apply in a branch and run full tests; consider overrides or waiting for upstream fixes if the fix is too disruptive.

---

## 4. Positive Security Posture

- **Authentication:** NextAuth with JWT, credentials (email/password) with bcrypt compare, optional Entra/Azure AD B2C.
- **Passwords:** bcrypt (register, reset); no plaintext storage.
- **Admin:** Role check (`session.user.role === 'ADMIN'`) and admin re-auth cookie (HMAC-SHA256, timing-safe compare).
- **Stripe:** Webhook body verified with `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` before processing.
- **Headers:** X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy; `poweredByHeader: false`.
- **Database:** Prisma used for queries; raw SQL is parameterized or static (add-legal-name uses static DDL only).
- **Email:** User-controlled content in HTML emails escaped via `escapeHtml()` in `src/lib/email.ts`.
- **dangerouslySetInnerHTML:** Only used for static inline script (layout) and JSON-LD (server-derived); no user-controlled HTML injection.

---

## 5. Recommendations Summary

| Priority | Action |
|----------|--------|
| P0 | Remove or strictly protect `set-admin`; remove hardcoded secret. |
| P0 | Enforce CRON_SECRET on `send-reminders` (return 401 when invalid/missing). |
| P0 | Ensure CRON_SECRET (and NEXTAUTH_SECRET) are always set in production; do not run cron logic without auth. |
| P1 | Disable or restrict `api/test/env` in production. |
| P1 | Remove or protect `add-legal-name`; do not allow unauthenticated schema changes. |
| P1 | Harden `log-access`: do not use client-supplied IP for server-side fetch; optionally authenticate caller. |
| P1 | Upgrade Next.js to a patched 14.x; run `npm audit fix` and address remaining advisories. |
| P2 | Fail app or auth init if NEXTAUTH_SECRET is missing in production. |
| P2 | Consider Content-Security-Policy (CSP) and rate limiting for login/register and sensitive API routes. |

---

## 6. Scope and Limitations

- Assessment is based on static review and dependency audit; no dynamic testing (e.g. penetration testing) or Azure environment review.
- Secrets and production configuration were not validated (assumed in env only; no .env committed).
- CI/CD (e.g. `.github/workflows`) uses secrets (e.g. `DATABASE_URL`, `AZURE_WEBAPP_PUBLISH_PROFILE`); ensure they are stored in GitHub secrets and not logged.

---

*End of security assessment.*
