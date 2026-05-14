import { AuditEventType, ImportStatus, Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";

const SOURCE = "planning-assignment";

export type LkwDriverPairingImportPreview = {
  ok: true;
  source: "planning-db";
  counts: {
    assignmentRows: number;
    importablePairings: number;
  };
  scope: {
    fromDate: string | null;
    toDate: string | null;
  };
  examples: Array<{
    date: string;
    lkw: string;
    driver: string;
  }>;
};

export type LkwDriverPairingImportExecuteResult = LkwDriverPairingImportPreview & {
  importRunId: string;
  applied: {
    pairings: number;
  };
};

type PairingSourceRow = {
  lkwId: string;
  driverId: string;
  planningDate: Date;
  count: number;
};

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function collectPairingSourceRows(): Promise<PairingSourceRow[]> {
  const rows = await prisma.assignment.groupBy({
    by: ["lkwId", "driverId", "planningDate"],
    where: {
      deletedAt: null,
      lkwId: { not: null },
      driverId: { not: null },
    },
    _count: { _all: true },
    orderBy: [{ planningDate: "asc" }],
  });

  return rows
    .filter((row): row is typeof row & { lkwId: string; driverId: string } => Boolean(row.lkwId && row.driverId))
    .map((row) => ({
      lkwId: row.lkwId,
      driverId: row.driverId,
      planningDate: row.planningDate,
      count: row._count._all,
    }));
}

async function buildPreview(sourceRows: PairingSourceRow[]): Promise<LkwDriverPairingImportPreview> {
  const examples = await prisma.assignment.findMany({
    where: {
      deletedAt: null,
      lkwId: { not: null },
      driverId: { not: null },
    },
    orderBy: [{ planningDate: "asc" }],
    take: 10,
    include: {
      lkw: true,
      driver: true,
    },
  });

  const dates = sourceRows.map((row) => toDateOnly(row.planningDate)).sort();
  const assignmentRows = sourceRows.reduce((total, row) => total + row.count, 0);

  return {
    ok: true,
    source: "planning-db",
    counts: {
      assignmentRows,
      importablePairings: sourceRows.length,
    },
    scope: {
      fromDate: dates[0] || null,
      toDate: dates[dates.length - 1] || null,
    },
    examples: examples.map((row) => ({
      date: toDateOnly(row.planningDate),
      lkw: row.lkw?.number || "-",
      driver: row.driver?.fullName || "-",
    })),
  };
}

export async function previewLkwDriverPairingImport(): Promise<LkwDriverPairingImportPreview> {
  return buildPreview(await collectPairingSourceRows());
}

export async function executeLkwDriverPairingImport(): Promise<LkwDriverPairingImportExecuteResult> {
  const sourceRows = await collectPairingSourceRows();
  const preview = await buildPreview(sourceRows);
  const importRun = await prisma.importRun.create({
    data: {
      sourceType: "planning-lkw-driver-pairings",
      sourceFileName: "planning-db-assignments",
      status: ImportStatus.VALIDATED,
      validationStats: preview,
    },
  });

  let pairingsApplied = 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of sourceRows) {
        await tx.lkwDriverPairing.upsert({
          where: {
            lkwId_driverId_validFrom_source: {
              lkwId: row.lkwId,
              driverId: row.driverId,
              validFrom: row.planningDate,
              source: SOURCE,
            },
          },
          update: {
            validTo: row.planningDate,
            confidence: Math.min(100, 70 + row.count),
            rawPayload: {
              sourceAssignmentCount: row.count,
              importRunId: importRun.id,
            } satisfies Prisma.InputJsonObject,
          },
          create: {
            lkwId: row.lkwId,
            driverId: row.driverId,
            validFrom: row.planningDate,
            validTo: row.planningDate,
            source: SOURCE,
            confidence: Math.min(100, 70 + row.count),
            rawPayload: {
              sourceAssignmentCount: row.count,
              importRunId: importRun.id,
            } satisfies Prisma.InputJsonObject,
          },
        });
        pairingsApplied += 1;
      }

      await tx.importRun.update({
        where: { id: importRun.id },
        data: {
          status: ImportStatus.EXECUTED,
          executedAt: new Date(),
          validationStats: {
            ...preview,
            applied: { pairings: pairingsApplied },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.IMPORT_EXECUTED,
          entityType: "ImportRun",
          entityId: importRun.id,
          message: "LKW-driver pairings import executed",
          after: { pairings: pairingsApplied },
        },
      });
    }, {
      maxWait: 10_000,
      timeout: 300_000,
    });
  } catch (error) {
    await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        status: ImportStatus.FAILED,
        validationStats: {
          ...preview,
          error: error instanceof Error ? error.message : "Import failed",
        },
      },
    });
    throw error;
  }

  return {
    ...preview,
    importRunId: importRun.id,
    applied: {
      pairings: pairingsApplied,
    },
  };
}
