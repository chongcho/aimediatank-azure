-- CreateTable
CREATE TABLE "VoiceCall" (
    "id" TEXT NOT NULL,
    "callerId" TEXT NOT NULL,
    "calleeId" TEXT NOT NULL,
    "conversationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ringing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "VoiceCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceCallSignal" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "VoiceCallSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceCall_callerId_idx" ON "VoiceCall"("callerId");

-- CreateIndex
CREATE INDEX "VoiceCall_calleeId_idx" ON "VoiceCall"("calleeId");

-- CreateIndex
CREATE INDEX "VoiceCall_status_idx" ON "VoiceCall"("status");

-- CreateIndex
CREATE INDEX "VoiceCall_createdAt_idx" ON "VoiceCall"("createdAt");

-- CreateIndex
CREATE INDEX "VoiceCallSignal_callId_idx" ON "VoiceCallSignal"("callId");

-- CreateIndex
CREATE INDEX "VoiceCallSignal_toUserId_consumedAt_idx" ON "VoiceCallSignal"("toUserId", "consumedAt");

-- CreateIndex
CREATE INDEX "VoiceCallSignal_createdAt_idx" ON "VoiceCallSignal"("createdAt");

-- AddForeignKey
ALTER TABLE "VoiceCall" ADD CONSTRAINT "VoiceCall_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceCall" ADD CONSTRAINT "VoiceCall_calleeId_fkey" FOREIGN KEY ("calleeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceCallSignal" ADD CONSTRAINT "VoiceCallSignal_callId_fkey" FOREIGN KEY ("callId") REFERENCES "VoiceCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
