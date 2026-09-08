ALTER TABLE "ImageProvider" ADD COLUMN "publicModel" TEXT;

UPDATE "ImageProvider"
SET "publicModel" = CASE
  WHEN LOWER(TRIM("model")) IN ('gpt-image-2', 'gpt-image2-1k', 'gpt-image-2-1k')
    THEN 'gpt-image-2'
  ELSE LOWER(TRIM("model"))
END;

ALTER TABLE "ImageProvider" ALTER COLUMN "publicModel" SET NOT NULL;

CREATE INDEX "ImageProvider_enabled_publicModel_priority_idx"
ON "ImageProvider"("enabled", "publicModel", "priority");
