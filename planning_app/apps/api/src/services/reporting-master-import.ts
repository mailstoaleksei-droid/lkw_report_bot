import { AuditEventType, ImportStatus, MasterStatus, Prisma } from "@prisma/client";
import pg from "pg";
import { normalizeMasterStatus } from "../domain/status-normalization.js";
import { prisma } from "../prisma.js";

type ReportingCompanyRow = {
  id: string | number;
  name: string;
  code: string | null;
  is_active: boolean;
};

type ReportingTruckRow = {
  id: string | number;
  external_id: string;
  plate_number: string | null;
  truck_type: string | null;
  company_id: string | number | null;
  company_name: string | null;
  status: string | null;
  status_since: Date | string | null;
  is_active: boolean;
  source_row_hash: string | null;
  raw_payload: Record<string, unknown> | null;
};

type ReportingDriverRow = {
  id: string | number;
  external_id: string | null;
  full_name: string;
  phone: string | null;
  company_id: string | number | null;
  company_name: string | null;
  is_active: boolean;
  source_row_hash: string | null;
  raw_payload: Record<string, unknown> | null;
};

type PreviewIssue = {
  entity: "company" | "lkw" | "driver";
  externalId?: string | null;
  message: string;
};

type MasterImportData = {
  companies: ReportingCompanyRow[];
  trucks: ReportingTruckRow[];
  drivers: ReportingDriverRow[];
  issues: PreviewIssue[];
};

export type MasterImportPreview = {
  ok: true;
  source: "reporting-db";
  counts: {
    companies: number;
    trucks: number;
    trucksImportable: number;
    trucksSkipped: number;
    drivers: number;
    driversImportable: number;
  };
  statusCounts: {
    lkw: Record<string, number>;
    drivers: Record<string, number>;
  };
  aliasExamples: Array<{ lkwNumber: string; aliases: string[] }>;
  issues: PreviewIssue[];
};

export type MasterImportExecuteResult = MasterImportPreview & {
  importRunId: string;
  applied: {
    companies: number;
    lkw: number;
    lkwAliases: number;
    drivers: number;
  };
};

function requireReportingDatabaseUrl(): string {
  const url = process.env.REPORTING_DATABASE_URL;
  if (!url) {
    throw new Error("REPORTING_DATABASE_URL is required for reporting master import");
  }
  return url;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function textFromPayload(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function jsonPayload(payload: Record<string, unknown> | null): Prisma.InputJsonValue {
  return payload ? JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue : {};
}

function surnameFromName(fullName: string): string | null {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

function normalizePlate(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function buildLkwAliases(plateNumber: string): string[] {
  const normalized = normalizePlate(plateNumber);
  const aliases = new Set<string>([plateNumber.trim(), normalized]);
  const trailingDigits = normalized.match(/(\d+)$/)?.[1];
  if (trailingDigits) aliases.add(trailingDigits);
  const firstDigitSuffix = normalized.match(/\d.*/)?.[0];
  if (firstDigitSuffix) aliases.add(firstDigitSuffix);
  return Array.from(aliases).filter(Boolean);
}

function toMasterStatus(value: string | null | undefined, isActive: boolean): MasterStatus {
  const normalized = normalizeMasterStatus(value || (!isActive ? "inactive" : ""));
  if (normalized === "ACTIVE") return MasterStatus.ACTIVE;
  if (normalized === "INACTIVE") return MasterStatus.INACTIVE;
  if (normalized === "SOLD") return MasterStatus.SOLD;
  if (normalized === "RETURNED") return MasterStatus.RETURNED;
  if (normalized === "WORKSHOP") return MasterStatus.WORKSHOP;
  if (normalized === "RESERVE") return MasterStatus.RESERVE;
  if (normalized === "DISMISSED") return MasterStatus.DISMISSED;
  if (normalized === "VACATION") return MasterStatus.VACATION;
  if (normalized === "SICK") return MasterStatus.SICK;
  return MasterStatus.UNKNOWN;
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] || 0) + 1;
}

async function fetchMasterData(): Promise<MasterImportData> {
  const pool = new pg.Pool({
    connectionString: requireReportingDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  try {
    const [companiesResult, trucksResult, driversResult] = await Promise.all([
      pool.query<ReportingCompanyRow>(
        "select id, name, code, is_active from companies order by name",
      ),
      pool.query<ReportingTruckRow>(`
        select
          t.id,
          t.external_id,
          t.plate_number,
          t.truck_type,
          t.company_id,
          c.name as company_name,
          t.status,
          t.status_since,
          t.is_active,
          t.source_row_hash,
          t.raw_payload
        from trucks t
        left join companies c on c.id = t.company_id
        order by t.external_id
      `),
      pool.query<ReportingDriverRow>(`
        select
          d.id,
          d.external_id,
          d.full_name,
          d.phone,
          d.company_id,
          c.name as company_name,
          d.is_active,
          d.source_row_hash,
          d.raw_payload
        from drivers d
        left join companies c on c.id = d.company_id
        order by d.external_id nulls last, d.full_name
      `),
    ]);

    const issues: PreviewIssue[] = [];
    for (const truck of trucksResult.rows) {
      if (!truck.plate_number?.trim()) {
        issues.push({
          entity: "lkw",
          externalId: truck.external_id,
          message: "Skipped reporting truck without plate_number",
        });
      }
    }
    for (const driver of driversResult.rows) {
      if (!driver.full_name?.trim()) {
        issues.push({
          entity: "driver",
          externalId: driver.external_id,
          message: "Skipped reporting driver without full_name",
        });
      }
    }

    return {
      companies: companiesResult.rows,
      trucks: trucksResult.rows,
      drivers: driversResult.rows,
      issues,
    };
  } finally {
    await pool.end();
  }
}

function buildPreview(data: MasterImportData): MasterImportPreview {
  const lkwStatusCounts: Record<string, number> = {};
  const driverStatusCounts: Record<string, number> = {};

  const importableTrucks = data.trucks.filter((truck) => Boolean(truck.plate_number?.trim()));
  const importableDrivers = data.drivers.filter((driver) => Boolean(driver.full_name?.trim()));

  for (const truck of data.trucks) {
    const status = toMasterStatus(truck.status, truck.is_active);
    increment(lkwStatusCounts, status);
  }
  for (const driver of data.drivers) {
    const rawStatus = textFromPayload(driver.raw_payload, "Status");
    const status = toMasterStatus(rawStatus, driver.is_active);
    increment(driverStatusCounts, status);
  }

  return {
    ok: true,
    source: "reporting-db",
    counts: {
      companies: data.companies.length,
      trucks: data.trucks.length,
      trucksImportable: importableTrucks.length,
      trucksSkipped: data.trucks.length - importableTrucks.length,
      drivers: data.drivers.length,
      driversImportable: importableDrivers.length,
    },
    statusCounts: {
      lkw: lkwStatusCounts,
      drivers: driverStatusCounts,
    },
    aliasExamples: importableTrucks.slice(0, 8).map((truck) => ({
      lkwNumber: truck.plate_number || "",
      aliases: buildLkwAliases(truck.plate_number || ""),
    })),
    issues: data.issues.slice(0, 50),
  };
}

export async function previewReportingMasterImport(): Promise<MasterImportPreview> {
  return buildPreview(await fetchMasterData());
}

export async function executeReportingMasterImport(): Promise<MasterImportExecuteResult> {
  const data = await fetchMasterData();
  const preview = buildPreview(data);

  const importRun = await prisma.importRun.create({
    data: {
      sourceType: "reporting-db-master-data",
      sourceFileName: "reporting-db",
      status: ImportStatus.VALIDATED,
      validationStats: preview,
    },
  });

  const companyIdByReportingId = new Map<string, string>();
  const companyIdByName = new Map<string, string>();
  let companiesApplied = 0;
  let lkwApplied = 0;
  let lkwAliasesApplied = 0;
  let driversApplied = 0;

  try {
    await prisma.$transaction(async (tx) => {
    for (const company of data.companies) {
      const saved = await tx.company.upsert({
        where: { name: company.name },
        update: {
          code: company.code,
          isActive: company.is_active,
        },
        create: {
          name: company.name,
          code: company.code,
          isActive: company.is_active,
        },
      });
      companyIdByReportingId.set(String(company.id), saved.id);
      companyIdByName.set(company.name, saved.id);
      companiesApplied += 1;
    }

    for (const truck of data.trucks) {
      if (!truck.plate_number?.trim()) continue;
      const status = toMasterStatus(truck.status, truck.is_active);
      const statusSince = toDate(truck.status_since);
      const companyId =
        (truck.company_id ? companyIdByReportingId.get(String(truck.company_id)) : undefined) ||
        (truck.company_name ? companyIdByName.get(truck.company_name) : undefined) ||
        null;

      const saved = await tx.lkw.upsert({
        where: { number: truck.plate_number },
        update: {
          externalId: truck.external_id,
          type: truck.truck_type,
          companyId,
          status,
          rawStatus: truck.status,
          statusSince,
          soldDate: status === MasterStatus.SOLD ? statusSince : null,
          returnedDate: status === MasterStatus.RETURNED ? statusSince : null,
          isActive: truck.is_active,
          sourceRowHash: truck.source_row_hash,
          rawPayload: jsonPayload(truck.raw_payload),
          deletedAt: null,
        },
        create: {
          externalId: truck.external_id,
          number: truck.plate_number,
          type: truck.truck_type,
          companyId,
          status,
          rawStatus: truck.status,
          statusSince,
          soldDate: status === MasterStatus.SOLD ? statusSince : null,
          returnedDate: status === MasterStatus.RETURNED ? statusSince : null,
          isActive: truck.is_active,
          sourceRowHash: truck.source_row_hash,
          rawPayload: jsonPayload(truck.raw_payload),
        },
      });
      lkwApplied += 1;

      for (const alias of buildLkwAliases(truck.plate_number)) {
        await tx.lkwAlias.upsert({
          where: { alias_source: { alias, source: "reporting-db" } },
          update: { lkwId: saved.id },
          create: { lkwId: saved.id, alias, source: "reporting-db" },
        });
        lkwAliasesApplied += 1;
      }
    }

    for (const driver of data.drivers) {
      if (!driver.full_name?.trim()) continue;
      const rawStatus = textFromPayload(driver.raw_payload, "Status");
      const dismissedDate = toDate(textFromPayload(driver.raw_payload, "Datum entlassen"));
      const status = dismissedDate || !driver.is_active
        ? MasterStatus.DISMISSED
        : toMasterStatus(rawStatus, driver.is_active);
      const companyId =
        (driver.company_id ? companyIdByReportingId.get(String(driver.company_id)) : undefined) ||
        (driver.company_name ? companyIdByName.get(driver.company_name) : undefined) ||
        null;

      await tx.driver.upsert({
        where: { externalId: driver.external_id || `reporting:${driver.id}` },
        update: {
          fullName: driver.full_name,
          surname: surnameFromName(driver.full_name),
          phone: driver.phone,
          companyId,
          status,
          rawStatus,
          dismissedDate,
          isActive: driver.is_active && status !== MasterStatus.DISMISSED,
          sourceRowHash: driver.source_row_hash,
          rawPayload: jsonPayload(driver.raw_payload),
          deletedAt: null,
        },
        create: {
          externalId: driver.external_id || `reporting:${driver.id}`,
          fullName: driver.full_name,
          surname: surnameFromName(driver.full_name),
          phone: driver.phone,
          companyId,
          status,
          rawStatus,
          dismissedDate,
          isActive: driver.is_active && status !== MasterStatus.DISMISSED,
          sourceRowHash: driver.source_row_hash,
          rawPayload: jsonPayload(driver.raw_payload),
        },
      });
      driversApplied += 1;
    }

      await tx.importRun.update({
        where: { id: importRun.id },
        data: {
          status: ImportStatus.EXECUTED,
          executedAt: new Date(),
          validationStats: {
            ...preview,
            applied: {
              companies: companiesApplied,
              lkw: lkwApplied,
              lkwAliases: lkwAliasesApplied,
              drivers: driversApplied,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.IMPORT_EXECUTED,
          entityType: "ImportRun",
          entityId: importRun.id,
          message: "Reporting DB master data import executed",
          after: {
            companies: companiesApplied,
            lkw: lkwApplied,
            lkwAliases: lkwAliasesApplied,
            drivers: driversApplied,
          },
        },
      });
    }, {
      maxWait: 10_000,
      timeout: 60_000,
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
      companies: companiesApplied,
      lkw: lkwApplied,
      lkwAliases: lkwAliasesApplied,
      drivers: driversApplied,
    },
  };
}
