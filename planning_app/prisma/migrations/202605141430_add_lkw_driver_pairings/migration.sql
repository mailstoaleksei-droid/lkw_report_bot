CREATE TABLE "planning"."LkwDriverPairing" (
    "id" TEXT NOT NULL,
    "lkwId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'planning-assignment',
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "rawPayload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LkwDriverPairing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LkwDriverPairing_lkwId_driverId_validFrom_source_key"
    ON "planning"."LkwDriverPairing"("lkwId", "driverId", "validFrom", "source");

CREATE INDEX "LkwDriverPairing_lkwId_validFrom_idx"
    ON "planning"."LkwDriverPairing"("lkwId", "validFrom");

CREATE INDEX "LkwDriverPairing_driverId_validFrom_idx"
    ON "planning"."LkwDriverPairing"("driverId", "validFrom");

CREATE INDEX "LkwDriverPairing_source_idx"
    ON "planning"."LkwDriverPairing"("source");

ALTER TABLE "planning"."LkwDriverPairing"
    ADD CONSTRAINT "LkwDriverPairing_lkwId_fkey"
    FOREIGN KEY ("lkwId") REFERENCES "planning"."Lkw"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "planning"."LkwDriverPairing"
    ADD CONSTRAINT "LkwDriverPairing_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "planning"."Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
