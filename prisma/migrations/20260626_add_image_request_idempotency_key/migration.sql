ALTER TABLE "ImageGenerationRequest"
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "ImageGenerationRequest_apiKeyId_idempotencyKey_key"
ON "ImageGenerationRequest"("apiKeyId", "idempotencyKey");
