import { AuditEventType, ImportStatus, OrderStatus, Prisma } from "@prisma/client";
import pg from "pg";
import { prisma } from "../prisma.js";

type ReportingScheduleRow = {
  id: string | number;
  iso_year: number;
  iso_week: number;
  work_date: Date | string;
  company_id: string | number | null;
  company_name: string | null;
  truck_external_id: string | null;
  truck_plate_number: string | null;
  driver_external_id: string | null;
  driver_full_name: string | null;
  shift_code: string | null;
  assignment_type: string | null;
  source_sheet: string | null;
  source_row_no: number | null;
  source_row_hash: string | null;
  raw_payload: Record<string, unknown> | null;
};

type ScheduleIssue = {
  sourceId: string;
  severity: "warning" | "error";
  message: string;
};

type ScheduleImportData = {
  rows: ReportingScheduleRow[];
  assignmentRows: ReportingScheduleRow[];
  statusRows: ReportingScheduleRow[];
  issues: ScheduleIssue[];
};

export type ScheduleImportPreview = {
  ok: true;
  source: "reporting-db";
  scope: {
    fromDate: string | null;
    toDate: string | null;
  };
  counts: {
    schedules: number;
    assignmentRows: number;
    statusRowsSkipped: number;
    importableAssignments: number;
    missingLkw: number;
    missingDrivers: number;
  };
  examples: Array<{
    sourceId: string;
    date: string;
    lkw: string | null;
    driver: string | null;
    description: string;
  }>;
  issues: ScheduleIssue[];
};

export type ScheduleImportExecuteResult = ScheduleImportPreview & {
  importRunId: string;
  applied: {
    orders: number;
    assignments: number;
  };
};

function requireReportingDatabaseUrl(): string {
  const url = process.env.REPORTING_DATABASE_URL;
  if (!url) {
    throw new Error("REPORTING_DATABASE_URL is required for reporting schedule import");
  }
  return url;
}

function jsonPayload(payload: Record<string, unknown> | null): Prisma.InputJsonValue {
  return payload ? JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue : {};
}

function jsonObject(payload: Record<string, unknown> | null): Prisma.InputJsonObject {
  const value = jsonPayload(payload);
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.InputJsonObject
    : {};
}

function toDateOnly(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  if (Number.isNaN(value.getTime())) {
    return String(value).slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toPlanningDate(value: Date | string): Date {
  const dateOnly = toDateOnly(value);
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function descriptionFor(row: ReportingScheduleRow): string {
  const label = row.shift_code?.trim() || row.driver_full_name?.trim() || "Weekly assignment";
  return `Weekly schedule: ${label}`;
}

function externalOrderId(row: ReportingScheduleRow): string {
  return `reporting:schedule:${row.id}`;
}

async function fetchSchedules(): Promise<ScheduleImportData> {
  const pool = new pg.Pool({
    connectionString: requireReportingDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  try {
    const result = await pool.query<ReportingScheduleRow>(`
      select
        s.id,
        s.iso_year,
        s.iso_week,
        s.work_date,
        s.company_id,
        c.name as company_name,
        t.external_id as truck_external_id,
        t.plate_number as truck_plate_number,
        d.external_id as driver_external_id,
        d.full_name as driver_full_name,
        s.shift_code,
        s.assignment_type,
        s.source_sheet,
        s.source_row_no,
        s.source_row_hash,
        s.raw_payload
      from schedules s
      left join companies c on c.id = s.company_id
      left join trucks t on t.id = s.truck_id
      left join drivers d on d.id = s.driver_id
      order by s.work_date, s.id
    `);

    const assignmentRows = result.rows.filter((row) => row.assignment_type === "assignment");
    const statusRows = result.rows.filter((row) => row.assignment_type !== "assignment");
    const issues: ScheduleIssue[] = [];

    for (const row of assignmentRows) {
      if (!row.truck_external_id && !row.truck_plate_number) {
        issues.push({
          sourceId: String(row.id),
          severity: "warning",
          message: "Schedule assignment has no resolved LKW",
        });
      }
      if (!row.driver_external_id && !row.driver_full_name) {
        issues.push({
          sourceId: String(row.id),
          severity: "warning",
          message: "Schedule assignment has no resolved driver",
        });
      }
    }

    return {
      rows: result.rows,
      assignmentRows,
      statusRows,
      issues,
    };
  } finally {
    await pool.end();
  }
}

async function buildPreview(data: ScheduleImportData): Promise<ScheduleImportPreview> {
  const lkwExternalIds = data.assignmentRows
    .map((row) => row.truck_external_id)
    .filter((value): value is string => Boolean(value));
  const driverExternalIds = data.assignmentRows
    .map((row) => row.driver_external_id)
    .filter((value): value is string => Boolean(value));

  const [knownLkw, knownDrivers] = await Promise.all([
    prisma.lkw.findMany({
      where: { externalId: { in: Array.from(new Set(lkwExternalIds)) } },
      select: { externalId: true },
    }),
    prisma.driver.findMany({
      where: { externalId: { in: Array.from(new Set(driverExternalIds)) } },
      select: { externalId: true },
    }),
  ]);

  const knownLkwSet = new Set(knownLkw.map((row) => row.externalId).filter(Boolean));
  const knownDriverSet = new Set(knownDrivers.map((row) => row.externalId).filter(Boolean));
  const missingLkw = data.assignmentRows.filter(
    (row) => row.truck_external_id && !knownLkwSet.has(row.truck_external_id),
  ).length;
  const missingDrivers = data.assignmentRows.filter(
    (row) => row.driver_external_id && !knownDriverSet.has(row.driver_external_id),
  ).length;

  const dates = data.rows.map((row) => toDateOnly(row.work_date)).sort();

  return {
    ok: true,
    source: "reporting-db",
    scope: {
      fromDate: dates[0] || null,
      toDate: dates[dates.length - 1] || null,
    },
    counts: {
      schedules: data.rows.length,
      assignmentRows: data.assignmentRows.length,
      statusRowsSkipped: data.statusRows.length,
      importableAssignments: data.assignmentRows.length,
      missingLkw,
      missingDrivers,
    },
    examples: data.assignmentRows.slice(0, 10).map((row) => ({
      sourceId: String(row.id),
      date: toDateOnly(row.work_date),
      lkw: row.truck_plate_number,
      driver: row.driver_full_name,
      description: descriptionFor(row),
    })),
    issues: data.issues.slice(0, 50),
  };
}

export async function previewReportingScheduleImport(): Promise<ScheduleImportPreview> {
  return buildPreview(await fetchSchedules());
}

export async function executeReportingScheduleImport(): Promise<ScheduleImportExecuteResult> {
  const data = await fetchSchedules();
  const preview = await buildPreview(data);
  const importRun = await prisma.importRun.create({
    data: {
      sourceType: "reporting-db-schedules",
      sourceFileName: "reporting-db",
      status: ImportStatus.VALIDATED,
      validationStats: preview,
    },
  });

  let ordersApplied = 0;
  let assignmentsApplied = 0;

  const lkwByExternalId = new Map(
    (await prisma.lkw.findMany({
      where: {
        externalId: {
          in: Array.from(new Set(data.assignmentRows.map((row) => row.truck_external_id).filter(Boolean) as string[])),
        },
      },
      select: { id: true, externalId: true },
    })).map((row) => [row.externalId, row.id]),
  );
  const driverByExternalId = new Map(
    (await prisma.driver.findMany({
      where: {
        externalId: {
          in: Array.from(new Set(data.assignmentRows.map((row) => row.driver_external_id).filter(Boolean) as string[])),
        },
      },
      select: { id: true, externalId: true },
    })).map((row) => [row.externalId, row.id]),
  );

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of data.assignmentRows) {
        const lkwId = row.truck_external_id ? lkwByExternalId.get(row.truck_external_id) || null : null;
        const driverId = row.driver_external_id ? driverByExternalId.get(row.driver_external_id) || null : null;
        const hasLkwSource = Boolean(row.truck_external_id || row.truck_plate_number);
        const hasDriverSource = Boolean(row.driver_external_id || row.driver_full_name);
        const hasProblem =
          !hasLkwSource ||
          !hasDriverSource ||
          Boolean(row.truck_external_id && !lkwId) ||
          Boolean(row.driver_external_id && !driverId);
        const planningDate = toPlanningDate(row.work_date);
        const rawPayload = {
          ...jsonObject(row.raw_payload),
          reportingScheduleId: String(row.id),
          isoYear: row.iso_year,
          isoWeek: row.iso_week,
          sourceSheet: row.source_sheet,
          sourceRowNo: row.source_row_no,
          sourceRowHash: row.source_row_hash,
          assignmentType: row.assignment_type,
          shiftCode: row.shift_code,
          truckExternalId: row.truck_external_id,
          driverExternalId: row.driver_external_id,
        } as Prisma.InputJsonObject;

        const order = await tx.order.upsert({
          where: { externalOrderId: externalOrderId(row) },
          update: {
            planningDate,
            runde: 1,
            description: descriptionFor(row),
            tourType: "weekly-schedule",
            status: hasProblem ? OrderStatus.PROBLEM : OrderStatus.PLANNED,
            problemReason: hasProblem ? "Missing LKW or driver mapping from reporting DB" : null,
            info: `Reporting week ${row.iso_week}/${row.iso_year}`,
            deletedAt: null,
          },
          create: {
            planningDate,
            runde: 1,
            description: descriptionFor(row),
            tourType: "weekly-schedule",
            externalOrderId: externalOrderId(row),
            status: hasProblem ? OrderStatus.PROBLEM : OrderStatus.PLANNED,
            problemReason: hasProblem ? "Missing LKW or driver mapping from reporting DB" : null,
            info: `Reporting week ${row.iso_week}/${row.iso_year}`,
          },
        });
        ordersApplied += 1;

        await tx.assignment.deleteMany({ where: { orderId: order.id } });
        await tx.assignment.create({
          data: {
            orderId: order.id,
            lkwId,
            driverId,
            planningDate,
            runde: 1,
            status: hasProblem ? OrderStatus.PROBLEM : OrderStatus.PLANNED,
            problemReason: hasProblem ? "Missing LKW or driver mapping from reporting DB" : null,
            rawPayload,
          },
        });
        assignmentsApplied += 1;
      }

      await tx.importRun.update({
        where: { id: importRun.id },
        data: {
          status: ImportStatus.EXECUTED,
          executedAt: new Date(),
          validationStats: {
            ...preview,
            applied: {
              orders: ordersApplied,
              assignments: assignmentsApplied,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.IMPORT_EXECUTED,
          entityType: "ImportRun",
          entityId: importRun.id,
          message: "Reporting DB weekly schedules import executed",
          after: {
            orders: ordersApplied,
            assignments: assignmentsApplied,
          },
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
      orders: ordersApplied,
      assignments: assignmentsApplied,
    },
  };
}
