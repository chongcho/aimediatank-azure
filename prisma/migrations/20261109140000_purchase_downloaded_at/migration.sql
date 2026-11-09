-- Track when a buyer first downloaded purchased media (for download notice UI).

ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "downloadedAt" TIMESTAMP(3);
