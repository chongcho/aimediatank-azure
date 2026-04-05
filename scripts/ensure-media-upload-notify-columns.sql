-- Idempotent hotfix for Prisma P2022: missing column on "Media" (upload notify / deferred success).
-- Run against the database your App Service actually uses (must match Azure DATABASE_URL).
--
-- Context:
--   - Older deploys expected "deferredUploadSuccessNotify" (String).
--   - Current schema uses "uploadSuccessNotifySource" and "uploadLiveNotifiedAt".
-- Prefer: deploy latest staging + let CI run `prisma db push` with the correct DATABASE_URL secret.
-- Use this script if you need an immediate unblock or to fix drift on the runtime DB only.
--
-- Example:
--   npx prisma db execute --file scripts/ensure-media-upload-notify-columns.sql --schema prisma/schema.prisma
--   (with DATABASE_URL set to the same DB as production/staging App Service)

ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "deferredUploadSuccessNotify" TEXT;

ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "uploadSuccessNotifySource" TEXT;

ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "uploadLiveNotifiedAt" TIMESTAMP(3);
