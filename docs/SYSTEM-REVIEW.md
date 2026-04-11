# System Review: Stability, Reliability, Performance & Risks

This document summarizes a review of the **AI Media Tank (AiM)** (AI Media Tank, LLC (AiM)) Azure application across **database**, **storage**, **scroll/restore**, **upload/transcoding/download**, and **Azure services**, with identified weaknesses and recommendations.

---

## 1. Database

### Current state
- **Prisma** singleton in `src/lib/prisma.ts` (single client per process; no explicit connection pool config).
- No use of `prisma.$transaction()` in upload-complete or other multi-step writes.
- Schema has indexes on `userId`, `type`, `views`, `createdAt`, `isSold`, `isDeleted`, etc.

### Risks & weaknesses
| Risk | Impact | Recommendation |
|------|--------|----------------|
| **No transaction on upload complete** | If `prisma.media.create` succeeds but `prisma.user.update` (free uploads/credits) fails, DB is inconsistent: media exists but user count not updated. | **Done:** Media create + user update are now inside `prisma.$transaction` so both commit or both roll back. fileSize remains best-effort outside. |
| **Connection pool** | Default Prisma pool may be fine for single-instance; under scale-out, each instance has its own pool. No explicit `connection_limit` or timeout. | For production, consider setting `DATABASE_URL` with `?connection_limit=10` (or similar) and document; monitor connection usage in Azure. |
| **CI schema push** | Workflow runs `prisma db push --accept-data-loss` on every deploy. | Avoid accidental data loss: prefer migrations for production and run `db push` only in controlled cases; consider a separate “migrate” job. |

### Stability
- API routes generally use try/catch and return 500 with a safe response (e.g. media list returns `media: []` on error). Good.
- No evidence of connection leaks; Prisma manages the pool.

---

## 2. Storage (Azure Blob)

### Current state
- **SAS** generated in `src/app/api/upload/sas/route.ts` for client-side upload; **upload complete** in `src/app/api/upload/complete/route.ts` creates DB record and optionally fetches blob size via Azure SDK or HEAD.
- **mediaProcessor** downloads raw blob, transcodes, uploads variants, deletes raw.
- **Download** route generates short-lived SAS for attachment.

### Risks & weaknesses
| Risk | Impact | Recommendation |
|------|--------|----------------|
| **Upload complete assumes blob exists** | Client could call complete with a URL that was never uploaded or was deleted. Media record would point at missing blob; cron would later fail with “download failed”. | Optional: before creating media, HEAD the blob or get properties; reject complete if blob missing or size 0. |
| **No transaction with blob lifecycle** | Media is created with `url` pointing at raw blob. If transcoding later deletes the raw blob and then fails before writing variants, media points at a deleted blob. | Already mitigated by marking status `failed` and keeping `url`; cron retry or manual re-upload would need a different flow. Consider documenting. |
| **Blob URL parsing** | `parseBlobUrl` / `parseAzureUrl` handle various URL shapes; malformed URL could throw. | Parsing is in try/catch or returns null; mediaProcessor throws with a clear error and marks media failed. Acceptable. |
| **Storage env at runtime** | If `AZURE_STORAGE_CONNECTION_STRING` is missing or wrong, upload complete (fileSize path) and cron transcoding fail. | Document in deployment guide; health check does not probe storage (by design to keep health lightweight). |

### Performance
- Client uploads directly to blob (no double upload through server). Good.
- Transcoding reads/writes blobs sequentially; one video per cron run avoids memory spikes.

---

## 3. Scroll restore (homepage)

### Current state
- Scroll state saved to `sessionStorage` when navigating to media detail; on return, homepage reads it and runs **restore**: parallel fetch of N pages, merge, set media, then scroll to `[data-media-id]` with retries and correction intervals.
- **Restore path** sets `restoringScroll`, loads pages with `Promise.all`, then uses `requestAnimationFrame` and 30ms retries to find the target element.

### Risks & weaknesses (and fixes applied)
| Risk | Impact | Status |
|------|--------|--------|
| **Unhandled rejection in restorePages()** | If any `fetch` or `Promise.all` threw (network, JSON), the async promise rejected with no `.catch()`. Under `azure-run.js`, `unhandledRejection` calls `process.exit(1)` → **whole app could crash** when a user navigated back to home. | **Fixed:** `restorePages` wrapped in try/catch; on error we set `loading`/`restoringScroll`/`contentReady` and clear refs. `restorePages().catch()` added so the promise is never “unhandled”. |
| **Race with filter change** | If user changes sort/type/search while restore is in flight, runId checks prevent applying stale data; cleanup on cancel path sets `loading`/`restoringScroll`/`activeRestoreRunIdRef`. | Implemented; ensure refs are always cleared in catch (done). |
| **Many parallel requests** | Restoring 5 pages = 5 simultaneous `/api/media` requests. Could spike load. | Acceptable for typical use; could cap max restore pages (e.g. 5) if needed. |

### Performance
- Parallel fetch of pages is faster than sequential. Scroll correction (200ms, 15 times) limits reflows; reasonable.

---

## 4. Upload / transcoding / download

### Upload complete
- Creates media (VIDEO → `processingStatus: 'pending'`), optional fileSize update, user free/credit update, then returns. **Background** work: email + notification (fire-and-forget).

### Risk fixed
| Risk | Impact | Status |
|------|--------|--------|
| **Unhandled rejection from backgroundTasks()** | `backgroundTasks()` was called without `.catch()`. If `sendEmail` or `prisma.notification.create` threw, the returned promise rejected → `unhandledRejection` → under `azure-run.js`, **process.exit(1)**. One failed email could take down the app. | **Fixed:** `backgroundTasks().catch((e) => { ... })` so rejections are logged and do not exit the process. |

### Transcoding (cron + mediaProcessor)
- **Cron** (`/api/cron/process-videos`): one pending video per run; skips if another is still `processing` (with 30‑min stuck recovery); marks long‑pending (24h) as failed.
- **mediaProcessor**: downloads blob, runs FFmpeg (multiple resolutions + thumbnail), uploads, updates DB, deletes raw. Errors set `processingStatus: 'failed'`.

| Risk | Impact | Recommendation |
|------|--------|----------------|
| **HTTP request timeout** | Azure App Service request timeout (e.g. 230s) can close the HTTP request while FFmpeg is still running. The handler may never send a response; status may stay `processing` until 30‑min stuck logic marks it failed. | Consider running transcoding in a **separate worker** (e.g. Azure Function with longer timeout or queue-triggered), or increase request timeout only for the process-videos route if the platform allows. Document current behavior. |
| **FFmpeg no process timeout** | `runFfmpeg()` has no timeout; a bad or huge file could run indefinitely. | **Done:** `runFfmpeg()` now has a 25-minute wall-clock timeout; on timeout the process is killed and the promise rejects so media is marked failed. |
| **Disk space in container** | Transcoding uses `tmpdir()`; large or many concurrent runs could fill disk. | One video per invocation and cleanup in `finally` limit this; monitor disk on the App Service plan. |

### Download
- Access control (owner / free / purchased); SAS with 15‑min expiry and `Content-Disposition: attachment`. Low risk; errors return 4xx/5xx.

---

## 5. Azure services & deployment

### Current state
- **Next.js** `output: 'standalone'`; deploy copies standalone + static + public + `run.js` (azure-run wrapper) and `node_modules/ffmpeg-static`.
- **Startup:** `node run.js` → loads `server.js`; `run.js` registers `uncaughtException` / `unhandledRejection` and **exits with code 1** on either.
- **Health:** `/api/health` returns 200 without DB/storage; used for platform health checks.
- **Cron:** Azure Function (process-videos) calls Web App `/api/cron/process-videos` every minute; Web App needs `CRON_SECRET`, Function needs `WEBAPP_URL` + same `CRON_SECRET`.

### Risks & weaknesses
| Risk | Impact | Recommendation |
|------|--------|----------------|
| **Any unhandled rejection exits process** | With `azure-run.js`, a single unhandled promise rejection (e.g. from a fire-and-forget or missing catch) triggers `process.exit(1)` → **production down**. | **Fixed** for upload background and scroll restore. Audit other fire-and-forget or async paths (e.g. other crons, webhooks) and ensure every async entry point has `.catch()` or try/catch. |
| **db push in CI** | Every deploy runs `prisma db push --accept-data-loss`. Mistaken schema change could drop data. | Prefer migrations for production; restrict `db push` to dev or explicit ops; avoid `--accept-data-loss` in production pipeline. |
| **No request timeout for long routes** | process-videos can run many minutes; platform may kill the request. | See transcoding section; consider worker or route-specific timeout configuration. |
| **Single region / single app instance** | No multi-region or queue-based processing. | Acceptable for current scale; document as future improvement. |

### Stability
- Health check is cheap (no DB), so Azure can restart the app without triggering heavy work.
- Retry on 409 deploy failure (wait 90s, redeploy) reduces deploy flakiness.

---

## 6. Summary: high‑impact items

1. **Unhandled rejections → process exit**  
   **Fixed:** Upload background tasks and scroll restore now attach `.catch()` and/or try/catch so they cannot crash the process.

2. **Upload complete not transactional**  
   **Done:** Media create and user update now run in a single `prisma.$transaction`; both commit or both roll back.

3. **Transcoding HTTP timeout**  
   **Open:** Long-running FFmpeg can exceed Azure request timeout; job may stay “processing” until 30‑min recovery. **Done:** FFmpeg process timeout (25 min) added; on timeout the job is marked failed.

4. **Schema changes in CI**  
   **Open:** `db push --accept-data-loss` on every deploy is risky. **Recommendation:** Use migrations and remove or narrow `db push` in production workflow.

5. **Cron dependency**  
   **Documented:** If the process-videos Function is not deployed or WEBAPP_URL/CRON_SECRET are wrong, videos stay pending/failed. See AZURE-DEPLOYMENT.md troubleshooting.

---

## 7. Quick checklist for future changes

- [ ] Any `async` function used fire-and-forget (not awaited) must have `.catch()` or be wrapped in try/catch so it cannot cause unhandledRejection.
- [ ] Multi-step DB writes that must stay consistent should use `prisma.$transaction` where applicable.
- [ ] New long-running API routes (e.g. > 1 min) should consider timeouts, background jobs, or worker processes.
- [ ] Schema changes: prefer `prisma migrate` and avoid `db push --accept-data-loss` in production CI.
