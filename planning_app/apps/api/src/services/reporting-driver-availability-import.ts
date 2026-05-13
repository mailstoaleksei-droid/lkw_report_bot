import { AuditEventType, ImportStatus, MasterStatus, Prisma } from "@prisma/client";
import pg from "pg";
import { prisma } from "../prisma.js";

const SOURCE = "reporting-db-weekly-status";
const UNAVAILABLE_REASON = "Driver unavailable from reporting weekly status";

type ReportingWeeklyStatusRow = {
  report_year: number;
  iso_week: number;
  week_start: Date | string;
  week_end: Date | string;
  fahrer_id: string;
  fahrer_name: string;
  company_name: string | null;
  week_code: string;
  is_active_in_week: boolean;
  raw_payload: Record<string, unknown> | null;
};

type AvailabilityIssue = {
  sourceDriverId: string;
  severity: "warning" | "error";
  message: string;
};

type AvailabilityImportData = {
  rows: ReportingWeeklyStatusRow[];
  issues: AvailabilityIssue[];
};

export type DriverAvailabilityImportPreview = {
  ok: true;
  source: "reporting-db";
  scope: {
    fromDate: string | null;
    toDate: string | null;
  };
  counts: {
    weeklyRows: number;
    vacationWeeks: number;
    sickWeeks: number;
    importableWeeks: number;
    availabilityDays: number;
    missingDrivers: number;
  };
  examples: Array<{
    driverExternalId: string;
    driverName: string;
    fromDate: string;
    toDate: string;
    status: "VACATION" | "SICK";
  }>;
  issues: AvailabilityIssue[];
};

export type DriverAvailabilityImportExecuteResult = DriverAvailabilityImportPreview & {
  importRunId: string;
  applied: {
    availabilityDays: number;
    assignmentsMarkedProblem: number;
    ordersMarkedProblem: number;
  };
};

function requireReportingDatabaseUrl(): string {
  const url = process.env.REPORTING_DATABASE_URL;
  if (!url) {
    throw new Error("REPORTING_DATABASE_URL is required for reporting driver availability import");
  }
  return url;
}

function toDateOnly(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (Number.isNaN(value.getTime())) return String(value).slice(0, 10);

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toPlanningDate(value: Date | string): Date {
  return new Date(`${toDateOnly(value)}T00:00:00.000Z`);
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysBetween(start: Date | string, end: Date | string): string[] {
  const current = toPlanningDate(start);
  const last = toPlanningDate(end);
  const days: string[] = [];

  while (current.getTime() <= last.getTime()) {
    days.push(toDateOnly(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return days;
}

function toAvailabilityStatus(code: string): MasterStatus {
  return code.trim().toUpperCase() === "K" ? MasterStatus.SICK : MasterStatus.VACATION;
}

function statusLabel(code: string): "VACATION" | "SICK" {
  return toAvailabilityStatus(code) === MasterStatus.SICK ? "SICK" : "VACATION";
}

function jsonPayload(payload: Record<string, unknown> | null): Prisma.InputJsonValue {
  return payload ? JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue : {};
}

async function fetchAvailabilityRows(): Promise<AvailabilityImportData> {
  const pool = new pg.Pool({
    connectionString: requireReportingDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  try {
    const result = await pool.query<ReportingWeeklyStatusRow>(`
      select
        report_year,
        iso_week,
        week_start,
        week_end,
        fahrer_id,
        fahrer_name,
        company_name,
        week_code,
        is_active_in_week,
        raw_payload
      from report_fahrer_weekly_status
      where week_code in ('U', 'K')
      order by week_start, fahrer_id
    `);

    return {
      rows: result.rows,
      issues: [],
    };
  } finally {
    await pool.end();
  }
}

async function buildPreview(data: AvailabilityImportData): Promise<DriverAvailabilityImportPreview> {
  const driverExternalIds = Array.from(new Set(data.rows.map((row) => row.fahrer_id).filter(Boolean)));
  const knownDrivers = await prisma.driver.findMany({
    where: { externalId: { in: driverExternalIds } },
    select: { externalId: true },
  });
  const knownDriverSet = new Set(knownDrivers.map((row) => row.externalId).filter(Boolean));
  const missingRows = data.rows.filter((row) => !knownDriverSet.has(row.fahrer_id));
  const issues: AvailabilityIssue[] = [
    ...data.issues,
    ...missingRows.slice(0, 50).map((row) => ({
      sourceDriverId: row.fahrer_id,
      severity: "warning" as const,
      message: `Driver ${row.fahrer_id} is not present in planning master data`,
    })),
  ];

  const dates = data.rows.flatMap((row) => [toDateOnly(row.week_start), toDateOnly(row.week_end)]).sort();
  const importableRows = data.rows.filter((row) => knownDriverSet.has(row.fahrer_id));
  const vacationWeeks = data.rows.filter((row) => row.week_code === "U").length;
  const sickWeeks = data.rows.filter((row) => row.week_code === "K").length;
  const availabilityDays = importableRows.reduce(
    (total, row) => total + daysBetween(row.week_start, row.week_end).length,
    0,
  );

  return {
    ok: true,
    source: "reporting-db",
    scope: {
      fromDate: dates[0] || null,
      toDate: dates[dates.length - 1] || null,
    },
    counts: {
      weeklyRows: data.rows.length,
      vacationWeeks,
      sickWeeks,
      importableWeeks: importableRows.length,
      availabilityDays,
      missingDrivers: missingRows.length,
    },
    examples: importableRows.slice(0, 10).map((row) => ({
      driverExternalId: row.fahrer_id,
      driverName: row.fahrer_name,
      fromDate: toDateOnly(row.week_start),
      toDate: toDateOnly(row.week_end),
      status: statusLabel(row.week_code),
    })),
    issues,
  };
}

export async function previewReportingDriverAvailabilityImport(): Promise<DriverAvailabilityImportPreview> {
  return buildPreview(await fetchAvailabilityRows());
}

export async function executeReportingDriverAvailabilityImport(): Promise<DriverAvailabilityImportExecuteResult> {
  const data = await fetchAvailabilityRows();
  const preview = await buildPreview(data);
  const importRun = await prisma.importRun.create({
    data: {
      sourceType: "reporting-db-driver-availability",
      sourceFileName: "reporting-db",
      status: ImportStatus.VALIDATED,
      validationStats: preview,
    },
  });

  const driverByExternalId = new Map(
    (await prisma.driver.findMany({
      where: {
        externalId: {
          in: Array.from(new Set(data.rows.map((row) => row.fahrer_id).filter(Boolean))),
        },
      },
      select: { id: true, externalId: true },
    })).map((row) => [row.externalId, row.id]),
  );

  let availabilityDaysApplied = 0;
  let assignmentsMarkedProblem = 0;
  let ordersMarkedProblem = 0;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.driverAvailability.deleteMany({ where: { source: SOURCE } });

      const availabilityRows: Prisma.DriverAvailabilityCreateManyInput[] = [];
      for (const row of data.rows) {
        const driverId = driverByExternalId.get(row.fahrer_id);
        if (!driverId) continue;

        for (const dateOnly of daysBetween(row.week_start, row.week_end)) {
          availabilityRows.push({
            driverId,
            date: new Date(`${dateOnly}T00:00:00.000Z`),
            status: toAvailabilityStatus(row.week_code),
            rawStatus: row.week_code,
            source: SOURCE,
            importRunId: importRun.id,
            rawPayload: {
              ...jsonPayload(row.raw_payload) as Prisma.InputJsonObject,
              reportYear: row.report_year,
              isoWeek: row.iso_week,
              weekStart: toDateOnly(row.week_start),
              weekEnd: toDateOnly(row.week_end),
              sourceDriverId: row.fahrer_id,
              sourceDriverName: row.fahrer_name,
              companyName: row.company_name,
              isActiveInWeek: row.is_active_in_week,
            },
          });
        }
      }

      if (availabilityRows.length > 0) {
        const createResult = await tx.driverAvailability.createMany({
          data: availabilityRows,
          skipDuplicates: true,
        });
        availabilityDaysApplied = createResult.count;
      }

      assignmentsMarkedProblem = await tx.$executeRaw`
        update planning."Assignment" a
        set
          status = 'PROBLEM'::planning."OrderStatus",
          "problemReason" = case
            when a."problemReason" is null or a."problemReason" = '' then ${UNAVAILABLE_REASON}
            when position(${UNAVAILABLE_REASON} in a."problemReason") > 0 then a."problemReason"
            else a."problemReason" || '; ' || ${UNAVAILABLE_REASON}
          end,
          "updatedAt" = now()
        from planning."DriverAvailability" da
        where a."driverId" = da."driverId"
          and a."planningDate"::date = da.date::date
          and da.source = ${SOURCE}
          and a."deletedAt" is null
          and a.status <> 'PROBLEM'::planning."OrderStatus"
      `;

      ordersMarkedProblem = await tx.$executeRaw`
        update planning."Order" o
        set
          status = 'PROBLEM'::planning."OrderStatus",
          "problemReason" = case
            when o."problemReason" is null or o."problemReason" = '' then ${UNAVAILABLE_REASON}
            when position(${UNAVAILABLE_REASON} in o."problemReason") > 0 then o."problemReason"
            else o."problemReason" || '; ' || ${UNAVAILABLE_REASON}
          end,
          "updatedAt" = now()
        from planning."Assignment" a
        where a."orderId" = o.id
          and a.status = 'PROBLEM'::planning."OrderStatus"
          and a."problemReason" like ${`%${UNAVAILABLE_REASON}%`}
          and o."deletedAt" is null
          and o.status <> 'PROBLEM'::planning."OrderStatus"
      `;

      await tx.importRun.update({
        where: { id: importRun.id },
        data: {
          status: ImportStatus.EXECUTED,
          executedAt: new Date(),
          validationStats: {
            ...preview,
            applied: {
              availabilityDays: availabilityDaysApplied,
              assignmentsMarkedProblem,
              ordersMarkedProblem,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.IMPORT_EXECUTED,
          entityType: "ImportRun",
          entityId: importRun.id,
          message: "Reporting DB driver availability import executed",
          after: {
            availabilityDays: availabilityDaysApplied,
            assignmentsMarkedProblem,
            ordersMarkedProblem,
          },
        },
      });
    }, {
      maxWait: 10_000,
      timeout: 120_000,
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
      availabilityDays: availabilityDaysApplied,
      assignmentsMarkedProblem,
      ordersMarkedProblem,
    },
  };
}
