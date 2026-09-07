-- Personal hide of a single media item (viewer-only; does not block the creator).

CREATE TABLE IF NOT EXISTS "MediaBlock" (
  "id" TEXT NOT NULL,
  "blockerId" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MediaBlock_blockerId_mediaId_key" ON "MediaBlock"("blockerId", "mediaId");
CREATE INDEX IF NOT EXISTS "MediaBlock_blockerId_idx" ON "MediaBlock"("blockerId");
CREATE INDEX IF NOT EXISTS "MediaBlock_mediaId_idx" ON "MediaBlock"("mediaId");

ALTER TABLE "MediaBlock" DROP CONSTRAINT IF EXISTS "MediaBlock_blockerId_fkey";
ALTER TABLE "MediaBlock" ADD CONSTRAINT "MediaBlock_blockerId_fkey"
  FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaBlock" DROP CONSTRAINT IF EXISTS "MediaBlock_mediaId_fkey";
ALTER TABLE "MediaBlock" ADD CONSTRAINT "MediaBlock_mediaId_fkey"
  FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
