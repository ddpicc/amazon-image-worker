ALTER TABLE "PricingSku"
ADD COLUMN "model" TEXT NOT NULL DEFAULT 'gpt-image-2';

ALTER TABLE "PricingSkuPriceHistory"
ADD COLUMN "model" TEXT NOT NULL DEFAULT 'gpt-image-2';

DROP INDEX IF EXISTS "PricingSku_sku_key";
DROP INDEX IF EXISTS "PricingSkuPriceHistory_sku_version_key";

CREATE UNIQUE INDEX "PricingSku_model_sku_key"
ON "PricingSku"("model", "sku");

CREATE UNIQUE INDEX "PricingSkuPriceHistory_model_sku_version_key"
ON "PricingSkuPriceHistory"("model", "sku", "version");

CREATE INDEX "PricingSku_model_enabled_idx"
ON "PricingSku"("model", "enabled");

CREATE INDEX "PricingSkuPriceHistory_model_sku_createdAt_idx"
ON "PricingSkuPriceHistory"("model", "sku", "createdAt" DESC);

INSERT INTO "PricingSku" (
  "id", "model", "sku", "label", "priceFen", "version", "enabled", "updatedBy", "createdAt", "updatedAt"
)
SELECT
  'pricing_sku_agnes_image_2_5_flash_' || "sku",
  'agnes-image-2.5-flash',
  "sku",
  "label",
  "priceFen",
  "version",
  "enabled",
  'migration',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PricingSku"
WHERE "model" = 'gpt-image-2'
ON CONFLICT ("model", "sku") DO NOTHING;

INSERT INTO "PricingSkuPriceHistory" (
  "id", "pricingSkuId", "model", "sku", "version", "priceFen", "enabled", "updatedBy", "createdAt"
)
SELECT
  'pricing_sku_history_agnes_image_2_5_flash_' || "sku" || '_v' || "version",
  "id",
  "model",
  "sku",
  "version",
  "priceFen",
  "enabled",
  'migration',
  CURRENT_TIMESTAMP
FROM "PricingSku"
WHERE "model" = 'agnes-image-2.5-flash'
ON CONFLICT ("model", "sku", "version") DO NOTHING;
