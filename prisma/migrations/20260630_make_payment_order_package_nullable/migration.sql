ALTER TABLE "PaymentOrder"
ALTER COLUMN "packageId" DROP NOT NULL;

ALTER TABLE "PaymentOrder"
DROP CONSTRAINT "PaymentOrder_packageId_fkey";

ALTER TABLE "PaymentOrder"
ADD CONSTRAINT "PaymentOrder_packageId_fkey"
FOREIGN KEY ("packageId") REFERENCES "TopupPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
