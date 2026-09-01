-- Extend reports for user/chat targets; add user blocks for UGC safety (App Store 1.2).

ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "reportType" TEXT NOT NULL DEFAULT 'MEDIA';
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "reportedUserId" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "chatMessageId" TEXT;
ALTER TABLE "Report" ALTER COLUMN "mediaId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "Report_reportedUserId_idx" ON "Report"("reportedUserId");
CREATE INDEX IF NOT EXISTS "Report_chatMessageId_idx" ON "Report"("chatMessageId");

ALTER TABLE "Report" DROP CONSTRAINT IF EXISTS "Report_mediaId_fkey";
ALTER TABLE "Report" ADD CONSTRAINT "Report_mediaId_fkey"
  FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Report" DROP CONSTRAINT IF EXISTS "Report_reportedUserId_fkey";
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedUserId_fkey"
  FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Report" DROP CONSTRAINT IF EXISTS "Report_chatMessageId_fkey";
ALTER TABLE "Report" ADD CONSTRAINT "Report_chatMessageId_fkey"
  FOREIGN KEY ("chatMessageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "UserBlock" (
  "id" TEXT NOT NULL,
  "blockerId" TEXT NOT NULL,
  "blockedId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");
CREATE INDEX IF NOT EXISTS "UserBlock_blockerId_idx" ON "UserBlock"("blockerId");
CREATE INDEX IF NOT EXISTS "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

ALTER TABLE "UserBlock" DROP CONSTRAINT IF EXISTS "UserBlock_blockerId_fkey";
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey"
  FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserBlock" DROP CONSTRAINT IF EXISTS "UserBlock_blockedId_fkey";
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey"
  FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
