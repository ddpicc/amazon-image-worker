ALTER TABLE "ApiKey" ADD COLUMN "revokedAt" TIMESTAMP(3);

CREATE INDEX "ApiKey_revokedAt_idx" ON "ApiKey"("revokedAt");
