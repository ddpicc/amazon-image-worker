ALTER TYPE "UsageStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_RECHARGE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentOrderStatus') THEN
    CREATE TYPE "PaymentOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');
  END IF;
END $$;

ALTER TABLE "User" ADD COLUMN "balanceFen" INTEGER NOT NULL DEFAULT 0;
UPDATE "User" SET "balanceFen" = ROUND(COALESCE("balance", 0) * 100);
ALTER TABLE "User" DROP COLUMN "balance";

ALTER TABLE "ImageGenerationRequest"
  ADD COLUMN "costFen" INTEGER,
  ADD COLUMN "unitPriceFen" INTEGER,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CNY';
UPDATE "ImageGenerationRequest"
SET
  "costFen" = CASE WHEN "cost" IS NULL THEN NULL ELSE ROUND("cost" * 100) END,
  "unitPriceFen" = CASE WHEN "unitPrice" IS NULL THEN NULL ELSE ROUND("unitPrice" * 100) END;
ALTER TABLE "ImageGenerationRequest" DROP COLUMN "cost";
ALTER TABLE "ImageGenerationRequest" DROP COLUMN "unitPrice";

ALTER TABLE "BalanceLog"
  ADD COLUMN "paymentOrderId" TEXT,
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "amountFen" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "balanceAfterFen" INTEGER,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CNY',
  ADD COLUMN "idempotencyKey" TEXT;
UPDATE "BalanceLog" SET "amountFen" = ROUND(COALESCE("amount", 0) * 100);
ALTER TABLE "BalanceLog" DROP COLUMN "amount";

ALTER TABLE "PricingSku" ADD COLUMN "priceFen" INTEGER NOT NULL DEFAULT 0;
UPDATE "PricingSku" SET "priceFen" = ROUND(COALESCE("price", 0) * 100);
ALTER TABLE "PricingSku" DROP COLUMN "price";

ALTER TABLE "PricingSkuPriceHistory" ADD COLUMN "priceFen" INTEGER NOT NULL DEFAULT 0;
UPDATE "PricingSkuPriceHistory" SET "priceFen" = ROUND(COALESCE("price", 0) * 100);
ALTER TABLE "PricingSkuPriceHistory" DROP COLUMN "price";

CREATE TABLE "TopupPackage" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "priceFen" INTEGER NOT NULL,
  "creditFen" INTEGER NOT NULL,
  "bonusFen" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TopupPackage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentOrder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "outTradeNo" TEXT NOT NULL,
  "status" "PaymentOrderStatus" NOT NULL DEFAULT 'PENDING',
  "amountFen" INTEGER NOT NULL,
  "creditFen" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CNY',
  "payType" TEXT,
  "provider" TEXT,
  "providerOrderId" TEXT,
  "payUrl" TEXT NOT NULL DEFAULT '',
  "payUrl2" TEXT NOT NULL DEFAULT '',
  "qrcodeUrl" TEXT NOT NULL DEFAULT '',
  "qrcodeImg" TEXT NOT NULL DEFAULT '',
  "metadata" JSONB,
  "notifyPayload" JSONB,
  "paidAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "targetUserId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "requestId" TEXT,
  "ip" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BalanceLog_idempotencyKey_key" ON "BalanceLog"("idempotencyKey");
CREATE INDEX "BalanceLog_paymentOrderId_idx" ON "BalanceLog"("paymentOrderId");
CREATE INDEX "BalanceLog_requestId_idx" ON "BalanceLog"("requestId");

CREATE INDEX "TopupPackage_enabled_displayOrder_idx" ON "TopupPackage"("enabled", "displayOrder");

CREATE UNIQUE INDEX "PaymentOrder_outTradeNo_key" ON "PaymentOrder"("outTradeNo");
CREATE UNIQUE INDEX "PaymentOrder_providerOrderId_key" ON "PaymentOrder"("providerOrderId");
CREATE INDEX "PaymentOrder_userId_createdAt_idx" ON "PaymentOrder"("userId", "createdAt" DESC);
CREATE INDEX "PaymentOrder_status_createdAt_idx" ON "PaymentOrder"("status", "createdAt" DESC);

CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt" DESC);
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt" DESC);
CREATE INDEX "AuditLog_targetUserId_createdAt_idx" ON "AuditLog"("targetUserId", "createdAt" DESC);

ALTER TABLE "BalanceLog"
  ADD CONSTRAINT "BalanceLog_paymentOrderId_fkey"
  FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentOrder"
  ADD CONSTRAINT "PaymentOrder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentOrder"
  ADD CONSTRAINT "PaymentOrder_packageId_fkey"
  FOREIGN KEY ("packageId") REFERENCES "TopupPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
