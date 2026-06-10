-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('STARTED', 'QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "UpstreamApiKind" AS ENUM ('UNKNOWN', 'IMAGES_EDIT', 'IMAGES_GENERATE');

-- CreateEnum
CREATE TYPE "AiOperationKind" AS ENUM ('IMAGE_GENERATION');

-- CreateEnum
CREATE TYPE "AiProviderType" AS ENUM ('IMAGE');

-- CreateEnum
CREATE TYPE "ErrorType" AS ENUM ('RATE_LIMIT', 'AUTH_FAILURE', 'TIMEOUT', 'PROVIDER_ERROR', 'NETWORK_ERROR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AlertConditionType" AS ENUM ('CIRCUIT_BREAKER', 'FAILURE_RATE', 'LATENCY_THRESHOLD', 'PROVIDER_DOWN');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CostStatus" AS ENUM ('CHARGED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "UsageStatus" AS ENUM ('CHARGED', 'REFUNDED', 'ADMIN_CREDIT', 'ADMIN_DEBIT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "balance" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quota" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "monthlyLimit" INTEGER,
    "dailyLimit" INTEGER,
    "monthlyUsed" INTEGER NOT NULL DEFAULT 0,
    "dailyUsed" INTEGER NOT NULL DEFAULT 0,
    "monthlyResetAt" TIMESTAMP(3),
    "dailyResetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "apiKeyCiphertext" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3),
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "successfulAttempts" INTEGER NOT NULL DEFAULT 0,
    "totalDurationMs" INTEGER NOT NULL DEFAULT 0,
    "avgDurationMs" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostPerReq" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "circuitBreakerTrippedAt" TIMESTAMP(3),
    "circuitBreakerTripReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageGenerationRequest" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "operationId" TEXT,
    "selectedProviderId" TEXT,
    "selectedProviderName" TEXT,
    "selectedProviderBaseUrl" TEXT,
    "selectedProviderModel" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "finalUpstreamApiKind" "UpstreamApiKind" NOT NULL DEFAULT 'UNKNOWN',
    "status" "GenerationStatus" NOT NULL DEFAULT 'STARTED',
    "statusMessage" TEXT,
    "durationMs" INTEGER,
    "prompt" TEXT NOT NULL,
    "finalPrompt" TEXT,
    "revisedPrompt" TEXT,
    "imageType" TEXT,
    "aspectRatio" TEXT,
    "size" TEXT,
    "referenceImageCount" INTEGER NOT NULL DEFAULT 0,
    "referenceImagesJson" JSONB,
    "requestPayloadJson" JSONB,
    "requestSnapshotJson" JSONB,
    "responseSnapshotJson" JSONB,
    "errorMessage" TEXT,
    "callbackUrl" TEXT,
    "metadata" JSONB,
    "cost" DECIMAL(65,30),
    "costStatus" "CostStatus",
    "workerJobId" TEXT,
    "queuedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageGenerationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageGenerationAttempt" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "operationAttemptId" TEXT,
    "providerId" TEXT,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "attemptIndex" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'STARTED',
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "errorType" "ErrorType",
    "upstreamApiKind" "UpstreamApiKind" NOT NULL DEFAULT 'UNKNOWN',
    "requestSnapshotJson" JSONB,
    "responseSnapshotJson" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImageGenerationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedImageAsset" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "operationId" TEXT,
    "cosUrl" TEXT NOT NULL,
    "cosKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "upstreamSourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedImageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiOperation" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "kind" "AiOperationKind" NOT NULL,
    "entryPoint" TEXT,
    "status" "AttemptStatus" NOT NULL DEFAULT 'STARTED',
    "inputSummaryJson" JSONB,
    "outputSummaryJson" JSONB,
    "requestSnapshotJson" JSONB,
    "responseSnapshotJson" JSONB,
    "finalPrompt" TEXT,
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiOperationAttempt" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "providerType" "AiProviderType" NOT NULL,
    "providerId" TEXT,
    "providerName" TEXT,
    "baseUrl" TEXT,
    "model" TEXT,
    "attemptIndex" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'STARTED',
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "upstreamApiKind" "UpstreamApiKind" NOT NULL DEFAULT 'UNKNOWN',
    "requestSnapshotJson" JSONB,
    "responseSnapshotJson" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiOperationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderStatsSnapshot" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "successRate" DOUBLE PRECISION NOT NULL,
    "avgDurationMs" INTEGER NOT NULL,
    "totalAttempts" INTEGER NOT NULL,
    "successfulAttempts" INTEGER NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProviderStatsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "conditionType" "AlertConditionType" NOT NULL,
    "providerId" TEXT,
    "threshold" JSONB,
    "webhookUrl" TEXT NOT NULL,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "providerId" TEXT,
    "message" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizePrice" (
    "id" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "price" DECIMAL(10,4) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SizePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(10,4) NOT NULL,
    "status" "UsageStatus" NOT NULL,
    "reason" TEXT,
    "adminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_enabled_idx" ON "User"("role", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_enabled_idx" ON "ApiKey"("enabled");

-- CreateIndex
CREATE INDEX "ApiKey_ownerUserId_createdAt_idx" ON "ApiKey"("ownerUserId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Quota_apiKeyId_key" ON "Quota"("apiKeyId");

-- CreateIndex
CREATE INDEX "Quota_apiKeyId_idx" ON "Quota"("apiKeyId");

-- CreateIndex
CREATE UNIQUE INDEX "ImageProvider_name_key" ON "ImageProvider"("name");

-- CreateIndex
CREATE INDEX "ImageProvider_enabled_priority_idx" ON "ImageProvider"("enabled", "priority");

-- CreateIndex
CREATE INDEX "ImageProvider_cooldownUntil_idx" ON "ImageProvider"("cooldownUntil");

-- CreateIndex
CREATE UNIQUE INDEX "ImageGenerationRequest_operationId_key" ON "ImageGenerationRequest"("operationId");

-- CreateIndex
CREATE INDEX "ImageGenerationRequest_apiKeyId_createdAt_idx" ON "ImageGenerationRequest"("apiKeyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ImageGenerationRequest_createdAt_idx" ON "ImageGenerationRequest"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ImageGenerationRequest_selectedProviderId_idx" ON "ImageGenerationRequest"("selectedProviderId");

-- CreateIndex
CREATE INDEX "ImageGenerationRequest_status_createdAt_idx" ON "ImageGenerationRequest"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ImageGenerationAttempt_operationAttemptId_key" ON "ImageGenerationAttempt"("operationAttemptId");

-- CreateIndex
CREATE INDEX "ImageGenerationAttempt_requestId_attemptIndex_idx" ON "ImageGenerationAttempt"("requestId", "attemptIndex");

-- CreateIndex
CREATE INDEX "ImageGenerationAttempt_providerId_idx" ON "ImageGenerationAttempt"("providerId");

-- CreateIndex
CREATE INDEX "ImageGenerationAttempt_errorType_startedAt_idx" ON "ImageGenerationAttempt"("errorType", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "ImageGenerationAttempt_providerId_startedAt_idx" ON "ImageGenerationAttempt"("providerId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "GeneratedImageAsset_requestId_idx" ON "GeneratedImageAsset"("requestId");

-- CreateIndex
CREATE INDEX "GeneratedImageAsset_operationId_idx" ON "GeneratedImageAsset"("operationId");

-- CreateIndex
CREATE INDEX "AiOperation_apiKeyId_createdAt_idx" ON "AiOperation"("apiKeyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AiOperation_kind_createdAt_idx" ON "AiOperation"("kind", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AiOperation_status_createdAt_idx" ON "AiOperation"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AiOperationAttempt_operationId_attemptIndex_idx" ON "AiOperationAttempt"("operationId", "attemptIndex");

-- CreateIndex
CREATE INDEX "AiOperationAttempt_status_createdAt_idx" ON "AiOperationAttempt"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ProviderStatsSnapshot_providerId_snapshotAt_idx" ON "ProviderStatsSnapshot"("providerId", "snapshotAt" DESC);

-- CreateIndex
CREATE INDEX "ProviderStatsSnapshot_snapshotAt_idx" ON "ProviderStatsSnapshot"("snapshotAt");

-- CreateIndex
CREATE INDEX "AlertRule_enabled_conditionType_idx" ON "AlertRule"("enabled", "conditionType");

-- CreateIndex
CREATE INDEX "AlertRule_providerId_idx" ON "AlertRule"("providerId");

-- CreateIndex
CREATE INDEX "AlertEvent_ruleId_createdAt_idx" ON "AlertEvent"("ruleId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AlertEvent_severity_acknowledged_createdAt_idx" ON "AlertEvent"("severity", "acknowledged", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AlertEvent_providerId_idx" ON "AlertEvent"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "SizePrice_size_key" ON "SizePrice"("size");

-- CreateIndex
CREATE INDEX "SizePrice_enabled_idx" ON "SizePrice"("enabled");

-- CreateIndex
CREATE INDEX "BalanceLog_userId_createdAt_idx" ON "BalanceLog"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BalanceLog_status_idx" ON "BalanceLog"("status");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quota" ADD CONSTRAINT "Quota_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationRequest" ADD CONSTRAINT "ImageGenerationRequest_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationRequest" ADD CONSTRAINT "ImageGenerationRequest_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "AiOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationRequest" ADD CONSTRAINT "ImageGenerationRequest_selectedProviderId_fkey" FOREIGN KEY ("selectedProviderId") REFERENCES "ImageProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationAttempt" ADD CONSTRAINT "ImageGenerationAttempt_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ImageGenerationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationAttempt" ADD CONSTRAINT "ImageGenerationAttempt_operationAttemptId_fkey" FOREIGN KEY ("operationAttemptId") REFERENCES "AiOperationAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationAttempt" ADD CONSTRAINT "ImageGenerationAttempt_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ImageProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedImageAsset" ADD CONSTRAINT "GeneratedImageAsset_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ImageGenerationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedImageAsset" ADD CONSTRAINT "GeneratedImageAsset_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "AiOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiOperation" ADD CONSTRAINT "AiOperation_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiOperationAttempt" ADD CONSTRAINT "AiOperationAttempt_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "AiOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderStatsSnapshot" ADD CONSTRAINT "ProviderStatsSnapshot_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ImageProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ImageProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ImageProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceLog" ADD CONSTRAINT "BalanceLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

