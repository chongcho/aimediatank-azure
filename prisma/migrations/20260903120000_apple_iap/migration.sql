-- Apple IAP: membership fields on User, media purchase Apple IDs, transaction log.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appleOriginalTransactionId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appleProductId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appleSubscriptionStatus" TEXT;

ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "appleTransactionId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "appleProductId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Purchase_appleTransactionId_key" ON "Purchase"("appleTransactionId");

CREATE TABLE IF NOT EXISTS "AppleIapTransaction" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "originalTransactionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "mediaId" TEXT,
  "environment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppleIapTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppleIapTransaction_transactionId_key" ON "AppleIapTransaction"("transactionId");
CREATE INDEX IF NOT EXISTS "AppleIapTransaction_userId_idx" ON "AppleIapTransaction"("userId");
CREATE INDEX IF NOT EXISTS "AppleIapTransaction_originalTransactionId_idx" ON "AppleIapTransaction"("originalTransactionId");
CREATE INDEX IF NOT EXISTS "AppleIapTransaction_productId_idx" ON "AppleIapTransaction"("productId");
