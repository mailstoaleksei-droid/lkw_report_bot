-- Make reporting schedule imports idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS "Order_externalOrderId_key"
    ON "planning"."Order"("externalOrderId");
