CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "callbackUrl" TEXT NOT NULL,
    "attemptIndex" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'STARTED',
    "httpStatus" INTEGER,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "responseBodySample" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookDelivery_requestId_createdAt_idx" ON "WebhookDelivery"("requestId", "createdAt" DESC);
CREATE INDEX "WebhookDelivery_status_createdAt_idx" ON "WebhookDelivery"("status", "createdAt" DESC);

ALTER TABLE "WebhookDelivery"
ADD CONSTRAINT "WebhookDelivery_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "ImageGenerationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
