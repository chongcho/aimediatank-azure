# Security Improvements — What You Need To Do

Code changes from the security assessment have been applied. Complete the steps below so everything works correctly and stays secure.

---

## 1. Set Required Environment Variables

Add these in your **production** (and staging) environment (e.g. Azure App Service Application settings, or `.env` / GitHub Actions secrets). Do **not** commit real values to the repo.

| Variable | Required | Purpose |
|----------|----------|---------|
| **NEXTAUTH_SECRET** | Yes (production) | NextAuth signing + admin re-auth cookie. If missing in production, admin re-auth will throw. Use a long random string (e.g. `openssl rand -base64 32`). |
| **CRON_SECRET** | Yes (production) | Protects `/api/cron/*` (process-videos, send-reminders, cleanup). Azure Functions must send `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`. If missing in production, cron routes return 503. |
| **LOG_ACCESS_SECRET** | Recommended | Used so only your middleware can trigger geo lookup in `/api/admin/log-access`. Set to a random string; middleware will send it in `x-log-access-secret`. If unset, log-access still works but geo is never looked up (no SSRF from untrusted callers). |
| **ADMIN_SETUP_SECRET** | Only if using set-admin | One-time admin promotion. Set only when you need to call `/api/admin/set-admin`; use a strong random value. After creating your first admin, unset it or delete the route. |
| **ADMIN_ACCESS_SECURITY_EMAIL** | Optional | If set (e.g. your admin inbox), the app sends at most **one email per UTC hour** when an access log row is flagged as abnormal (common probes: `.git`, `.env`, WordPress paths, etc.). Uses the same Azure email sender as other app mail. |
| **ADMIN_PANEL_ACCESS_PASSWORD_HASH** | Recommended for admin hardening | Bcrypt hash of a **dedicated** admin panel passphrase (not the user’s login password). When set, `/admin` re-auth checks this value instead of the account password (email/SMS 2FA unchanged). Generate: `node -e "require('bcryptjs').hash('YourStrongPhrase',12).then(console.log)"`. |
| **ADMIN_PANEL_ACCESS_PASSWORD** | Dev only (avoid in prod) | Plaintext admin panel passphrase if you do not use the hash. Prefer **ADMIN_PANEL_ACCESS_PASSWORD_HASH** in production. If neither hash nor plain env is set, re-auth uses the **account password** as today. |
| **BLOCKED_IP_LIST_SECRET** | Optional (IP blocking) | Random string. When set, middleware loads the DB blocklist (via `/api/internal/blocked-ip-list`) and returns **403** for matching client IPs. Must match between env and what the server expects—generate e.g. `openssl rand -hex 32`. Without this, Admin → **Blocked IPs** still stores rows but **does not enforce** blocking. |

**Check:** In production, ensure `NEXTAUTH_SECRET` and `CRON_SECRET` are set. Otherwise auth and cron will fail as designed.

---

## 2. Azure Functions (Cron)

Your timer-triggered Azure Functions call the Next.js app with the cron secret. Ensure they send the same value as `CRON_SECRET`:

- **Header:** `Authorization: Bearer <CRON_SECRET>` **or** `x-cron-secret: <CRON_SECRET>`
- **Config:** In Azure Function App settings, set `CRON_SECRET` (or `WEBAPP_CRON_SECRET`) and have the function read it and send it in the request to the webapp.

If you use a single env var for the webapp (e.g. `CRON_SECRET`), the Azure Function app needs the same secret in its configuration so it can send it when calling the webapp.

---

## 3. One-Time / Optional Steps

### set-admin (create first admin)

- Set **ADMIN_SETUP_SECRET** in env to a strong random string.
- Call `POST /api/admin/set-admin` with body: `{ "email": "admin@example.com", "secret": "<ADMIN_SETUP_SECRET>" }`.
- After success, **unset ADMIN_SETUP_SECRET** in production (or delete `src/app/api/admin/set-admin/route.ts`) so the endpoint is disabled or removed.

### add-legal-name (migration)

- If you still need to run the legalName migration: log in as an **ADMIN** user and open (or call) `GET /api/admin/add-legal-name` once. The route is now protected; only admins can run it.
- After the column exists, you can remove or ignore this route.

---

## 4. Dependencies (npm audit)

Run and fix vulnerabilities:

```bash
npm audit
npm audit fix
```

If Next.js is still reported vulnerable, upgrade to a patched 14.x (e.g. 14.2.35 or latest 14.x) and test:

```bash
npm install next@14.2.35
```

Then run tests and a quick smoke test of auth and cron.

---

## 5. Checklist Summary

- [ ] **Production env:** `NEXTAUTH_SECRET` and `CRON_SECRET` set.
- [ ] **Optional:** `LOG_ACCESS_SECRET` set (recommended for geo in access logs).
- [ ] **Optional:** `ADMIN_ACCESS_SECURITY_EMAIL` set if you want hourly-throttled alerts for flagged access log entries.
- [ ] **Optional:** `ADMIN_PANEL_ACCESS_PASSWORD_HASH` (or dev-only plain `ADMIN_PANEL_ACCESS_PASSWORD`) if you want a **separate** passphrase for `/admin` re-auth instead of reusing the account password.
- [ ] **Optional:** `BLOCKED_IP_LIST_SECRET` if you use Admin → **Blocked IPs** and want enforcement (403) at the edge.
- [ ] **Azure Functions:** Sending `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret`) when calling cron URLs.
- [ ] **One-time:** If you use set-admin, set `ADMIN_SETUP_SECRET`, create admin, then unset or delete the route.
- [ ] **Dependencies:** Run `npm audit` / `npm audit fix` and upgrade Next.js if needed.

---

## 6. What Was Changed in Code

| Area | Change |
|------|--------|
| **Cron** | Shared `requireCronAuth()`: all three cron routes now require correct secret; in production they return 503 if `CRON_SECRET` is missing. |
| **set-admin** | Uses `ADMIN_SETUP_SECRET` from env; returns 503 if unset. No hardcoded secret. |
| **/api/test/env** | Returns 404 in production (no env metadata exposure). |
| **add-legal-name** | Requires admin session (`getServerSession` + role ADMIN). |
| **log-access** | Geo lookup only when request has valid `x-log-access-secret` (set by middleware when `LOG_ACCESS_SECRET` is set). Prevents SSRF via client-supplied IP. |
| **Middleware** | Sends `x-log-access-secret` when calling log-access if `LOG_ACCESS_SECRET` is set. |
| **Access logs** | Suspicious paths get JSON `abnormalFlags` on `SiteAccessLog`; optional `ADMIN_ACCESS_SECURITY_EMAIL` for throttled alerts; Admin → Access Logs has **Abnormal only** filter. |
| **Blocked IPs** | `BlockedIp` model; Admin → **Blocked IPs**; middleware enforces when `BLOCKED_IP_LIST_SECRET` is set (exempts `/api/auth/*`, Stripe webhook, cron, health, internal list). |
| **adminReauthCookie** | In production, throws if `NEXTAUTH_SECRET` is empty (no silent fallback to empty string). |

For full findings and context, see **SECURITY_ASSESSMENT.md**.
