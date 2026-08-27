-- CreateTable
CREATE TABLE "NativeAuthHandoff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'unknown',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NativeAuthHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NativeAuthHandoff_codeHash_key" ON "NativeAuthHandoff"("codeHash");

-- CreateIndex
CREATE INDEX "NativeAuthHandoff_userId_idx" ON "NativeAuthHandoff"("userId");

-- CreateIndex
CREATE INDEX "NativeAuthHandoff_expiresAt_idx" ON "NativeAuthHandoff"("expiresAt");

-- AddForeignKey
ALTER TABLE "NativeAuthHandoff" ADD CONSTRAINT "NativeAuthHandoff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
