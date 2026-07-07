-- Store proxy/platform headers when client IP is localhost or private (127.0.0.1 investigation).
ALTER TABLE "SiteAccessLog" ADD COLUMN IF NOT EXISTS "ipDebugHeaders" TEXT;
