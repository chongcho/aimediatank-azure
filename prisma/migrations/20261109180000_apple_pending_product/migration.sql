-- Pending Apple subscription product (scheduled upgrade/downgrade).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "applePendingProductId" TEXT;
