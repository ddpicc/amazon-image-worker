ALTER TABLE "ImageGenerationRequest"
ADD COLUMN "pricingSku" TEXT,
ADD COLUMN "unitPrice" DECIMAL(10,4),
ADD COLUMN "priceVersion" INTEGER;

CREATE TABLE "PricingSku" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" DECIMAL(10,4) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingSku_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PricingSkuPriceHistory" (
    "id" TEXT NOT NULL,
    "pricingSkuId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "price" DECIMAL(10,4) NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingSkuPriceHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PricingSku_sku_key" ON "PricingSku"("sku");
CREATE INDEX "PricingSku_enabled_idx" ON "PricingSku"("enabled");
CREATE UNIQUE INDEX "PricingSkuPriceHistory_sku_version_key" ON "PricingSkuPriceHistory"("sku", "version");
CREATE INDEX "PricingSkuPriceHistory_pricingSkuId_version_idx" ON "PricingSkuPriceHistory"("pricingSkuId", "version");
CREATE INDEX "PricingSkuPriceHistory_sku_createdAt_idx" ON "PricingSkuPriceHistory"("sku", "createdAt" DESC);

ALTER TABLE "PricingSkuPriceHistory"
ADD CONSTRAINT "PricingSkuPriceHistory_pricingSkuId_fkey"
FOREIGN KEY ("pricingSkuId") REFERENCES "PricingSku"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PricingSku" ("id", "sku", "label", "price", "version", "enabled", "updatedBy", "createdAt", "updatedAt")
VALUES
  (
    'pricing_sku_image_1k',
    'image_1k',
    'Image 1K',
    COALESCE((SELECT "price" FROM "SizePrice" WHERE "size" = '1024x1024' LIMIT 1), 0.0400),
    1,
    COALESCE((SELECT "enabled" FROM "SizePrice" WHERE "size" = '1024x1024' LIMIT 1), true),
    'migration',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'pricing_sku_image_2k',
    'image_2k',
    'Image 2K',
    COALESCE((SELECT "price" FROM "SizePrice" WHERE "size" = '2048x2048' LIMIT 1), 0.0800),
    1,
    COALESCE((SELECT "enabled" FROM "SizePrice" WHERE "size" = '2048x2048' LIMIT 1), true),
    'migration',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

INSERT INTO "PricingSkuPriceHistory" ("id", "pricingSkuId", "sku", "version", "price", "enabled", "updatedBy", "createdAt")
SELECT 'pricing_sku_history_' || "sku" || '_v' || "version", "id", "sku", "version", "price", "enabled", "updatedBy", CURRENT_TIMESTAMP
FROM "PricingSku"
WHERE "sku" IN ('image_1k', 'image_2k');
