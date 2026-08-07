CREATE TABLE "ProviderCircuitBreakerEvent" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "trippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tripReason" TEXT NOT NULL,
    "attemptId" TEXT,
    "requestId" TEXT,
    "attemptIndex" INTEGER,
    "baseUrl" TEXT,
    "model" TEXT,
    "errorType" "ErrorType",
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "prompt" TEXT,

    CONSTRAINT "ProviderCircuitBreakerEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProviderCircuitBreakerEvent"
ADD CONSTRAINT "ProviderCircuitBreakerEvent_providerId_fkey"
FOREIGN KEY ("providerId") REFERENCES "ImageProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ProviderCircuitBreakerEvent_providerId_trippedAt_idx"
ON "ProviderCircuitBreakerEvent"("providerId", "trippedAt" DESC);

CREATE INDEX "ProviderCircuitBreakerEvent_trippedAt_idx"
ON "ProviderCircuitBreakerEvent"("trippedAt" DESC);

INSERT INTO "ProviderCircuitBreakerEvent" (
    "id", "providerId", "trippedAt", "tripReason", "attemptId", "requestId", "attemptIndex",
    "baseUrl", "model", "errorType", "errorMessage", "durationMs", "prompt"
)
SELECT
    'legacy_' || p."id", p."id", p."circuitBreakerTrippedAt", p."circuitBreakerTripReason",
    a."id", a."requestId", a."attemptIndex", a."baseUrl", a."model", a."errorType",
    a."errorMessage", a."durationMs", r."prompt"
FROM "ImageProvider" p
LEFT JOIN LATERAL (
    SELECT *
    FROM "ImageGenerationAttempt"
    WHERE "providerId" = p."id"
      AND "status" = 'FAILED'
      AND "startedAt" <= p."circuitBreakerTrippedAt"
    ORDER BY "startedAt" DESC
    LIMIT 1
) a ON TRUE
LEFT JOIN "ImageGenerationRequest" r ON r."id" = a."requestId"
WHERE p."circuitBreakerTrippedAt" IS NOT NULL;
