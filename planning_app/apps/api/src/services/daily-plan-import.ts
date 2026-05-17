import * as nodePath from "path";
import ExcelJS from "exceljs";
import { AuditEventType, ImportStatus, OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";

function toJson(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v ?? {})) as Prisma.InputJsonValue;
}

const DATE_SHEET_RE = /^(\d{1,2})\.(\d{1,2})$/;

function requireWorkbookPath(): string {
  const p = process.env.DAILY_PLAN_WORKBOOK_PATH?.trim();
  if (!p) throw new Error("DAILY_PLAN_WORKBOOK_PATH is required for daily plan import");
  return p;
}

function detectWorkbookYear(workbookPath: string): number {
  const match = nodePath.basename(workbookPath).match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1], 10) : new Date().getFullYear();
}

function parseSheetDate(sheetName: string, year: number): Date | null {
  const m = sheetName.match(DATE_SHEET_RE);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1) return null;
  return d;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return "";
  if (typeof v === "object") {
    // Formula cell: { formula, result } — read the computed result
    if ("result" in v) {
      const result = (v as { result: unknown }).result;
      if (result === null || result === undefined) return "";
      if (typeof result === "string") return result.trim();
      if (typeof result === "number") return String(result);
      return "";
    }
    if ("text" in v) return String((v as { text: unknown }).text).trim();
    if ("richText" in v) {
      const rt = (v as { richText: Array<{ text: string }> }).richText;
      return rt.map((r) => r.text).join("").trim();
    }
  }
  return String(v).trim();
}

type StagingRow = {
  sourceSheet: string;
  sourceRow: number;
  planningDate: Date;
  wagenRaw: string;
  lkwId: string | null;
  lkwNumberRaw: string | null;
  runde: number;
  auftragText: string;
  plz: string | null;
  country: string | null;
  info: string | null;
  statusRaw: string | null;
  normalizedStatus: OrderStatus;
  validationCode: string | null;
  validationMessage: string | null;
  rawPayload: Record<string, unknown>;
};

type ImportIssue = {
  rowNumber: number;
  fieldName: string;
  severity: "warn" | "error";
  code: string;
  message: string;
  rawPayload?: Record<string, unknown>;
};

type ParsedSheet = {
  sheetName: string;
  planningDate: Date;
  rows: StagingRow[];
  issues: ImportIssue[];
};

async function buildLkwAliasMap(): Promise<Map<string, string>> {
  const aliases = await prisma.lkwAlias.findMany({ select: { alias: true, lkwId: true } });
  const map = new Map<string, string>();
  for (const a of aliases) {
    map.set(a.alias.trim().toUpperCase(), a.lkwId);
    map.set(a.alias.trim(), a.lkwId);
  }
  return map;
}

function resolveWagen(raw: string, aliasMap: Map<string, string>): string | null {
  if (!raw) return null;
  return aliasMap.get(raw) ?? aliasMap.get(raw.toUpperCase()) ?? null;
}

async function parseWorkbook(opts: { dateFilter?: Date }): Promise<ParsedSheet[]> {
  const filePath = requireWorkbookPath();
  const year = detectWorkbookYear(filePath);
  const aliasMap = await buildLkwAliasMap();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const result: ParsedSheet[] = [];

  for (const ws of wb.worksheets) {
    const planningDate = parseSheetDate(ws.name, year);
    if (!planningDate) continue;
    if (opts.dateFilter) {
      const f = opts.dateFilter;
      if (
        planningDate.getUTCFullYear() !== f.getUTCFullYear() ||
        planningDate.getUTCMonth() !== f.getUTCMonth() ||
        planningDate.getUTCDate() !== f.getUTCDate()
      ) continue;
    }

    const headerRow = ws.getRow(1);
    const colIndex: Record<string, number> = {};
    const rundeColIndexes: Array<{ runde: number; colIdx: number }> = [];

    headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
      const h = cellText(cell).trim();
      if (!h) return;
      const norm = h.toLowerCase().replace(/\s+/g, "_").replace(/\./g, "");
      colIndex[norm] = colNum;

      const rundeMatch = h.match(/^[Rr]unde[_\s]?(\d+)$/);
      if (rundeMatch) {
        rundeColIndexes.push({ runde: parseInt(rundeMatch[1], 10), colIdx: colNum });
      }
    });

    const wagenCol = colIndex["wagen"];
    const plzCol = colIndex["plz"];
    const landCol = colIndex["land"];
    const infoCol = colIndex["info"];
    const aktivCol = colIndex["aktiv"];

    const rows: StagingRow[] = [];
    const issues: ImportIssue[] = [];

    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum === 1) return;

      const wagenRaw = wagenCol ? cellText(row.getCell(wagenCol)) : "";
      if (!wagenRaw) return;

      const plzRaw = plzCol ? cellText(row.getCell(plzCol)) : null;
      const countryRaw = landCol ? cellText(row.getCell(landCol)) : null;
      const infoRaw = infoCol ? cellText(row.getCell(infoCol)) : null;
      const aktivRaw = aktivCol ? cellText(row.getCell(aktivCol)) : null;

      const lkwId = resolveWagen(wagenRaw, aliasMap);
      if (!lkwId) {
        issues.push({
          rowNumber: rowNum,
          fieldName: "Wagen",
          severity: "warn",
          code: "UNRESOLVED_WAGEN",
          message: `Wagen '${wagenRaw}' could not be resolved to a known LKW`,
          rawPayload: { wagenRaw },
        });
      }

      const isAktiv = aktivRaw === null || aktivRaw === "" || aktivRaw === "1" || aktivRaw === "true";

      const rawPayload: Record<string, unknown> = { wagenRaw, plzRaw, countryRaw, infoRaw, aktivRaw };

      const rundesFound = rundeColIndexes.length > 0 ? rundeColIndexes : [{ runde: 1, colIdx: -1 }];

      for (const { runde, colIdx } of rundesFound) {
        const auftragText = colIdx > 0 ? cellText(row.getCell(colIdx)) : "";
        if (!auftragText && rundeColIndexes.length > 0) continue;

        const normalizedStatus: OrderStatus = !isAktiv ? OrderStatus.PROBLEM : OrderStatus.OPEN;
        const validationCode = !lkwId ? "UNRESOLVED_WAGEN" : null;
        const validationMessage = !lkwId ? `Wagen '${wagenRaw}' unresolved` : null;

        rows.push({
          sourceSheet: ws.name,
          sourceRow: rowNum,
          planningDate,
          wagenRaw,
          lkwId,
          lkwNumberRaw: lkwId ? null : wagenRaw,
          runde,
          auftragText,
          plz: plzRaw || null,
          country: countryRaw || null,
          info: infoRaw || null,
          statusRaw: aktivRaw,
          normalizedStatus,
          validationCode,
          validationMessage,
          rawPayload: { ...rawPayload, runde, auftragText },
        });
      }
    });

    result.push({ sheetName: ws.name, planningDate, rows, issues });
  }

  return result;
}

export type DailyPlanImportPreview = {
  ok: true;
  source: "excel-daily-plan";
  workbookPath: string;
  year: number;
  scope: {
    dateFilter: string | null;
    sheetsFound: number;
    totalRows: number;
    totalOrders: number;
    resolvedLkw: number;
    unresolvedLkw: number;
  };
  sheets: Array<{
    sheetName: string;
    planningDate: string;
    rows: number;
    orders: number;
    unresolvedWagen: number;
  }>;
  issues: Array<{
    sheet: string;
    rowNumber: number;
    fieldName: string;
    severity: string;
    code: string;
    message: string;
  }>;
};

export type DailyPlanImportExecuteResult = DailyPlanImportPreview & {
  importRunId: string;
  applied: {
    orders: number;
    assignments: number;
    stagingRows: number;
    importErrors: number;
  };
};

export async function previewDailyPlanImport(opts: {
  dateFilter?: Date;
}): Promise<DailyPlanImportPreview> {
  const filePath = requireWorkbookPath();
  const year = detectWorkbookYear(filePath);
  const sheets = await parseWorkbook(opts);

  let totalRows = 0;
  let totalOrders = 0;
  let resolvedLkw = 0;
  let unresolvedLkw = 0;

  const sheetSummaries = sheets.map((s) => {
    const unresolved = s.issues.filter((i) => i.code === "UNRESOLVED_WAGEN").length;
    totalRows += s.rows.length;
    totalOrders += s.rows.length;
    resolvedLkw += s.rows.filter((r) => r.lkwId !== null).length;
    unresolvedLkw += s.rows.filter((r) => r.lkwId === null).length;
    return {
      sheetName: s.sheetName,
      planningDate: s.planningDate.toISOString().substring(0, 10),
      rows: s.rows.length,
      orders: s.rows.length,
      unresolvedWagen: unresolved,
    };
  });

  const allIssues = sheets.flatMap((s) =>
    s.issues.map((i) => ({ sheet: s.sheetName, ...i })),
  );

  return {
    ok: true,
    source: "excel-daily-plan",
    workbookPath: filePath,
    year,
    scope: {
      dateFilter: opts.dateFilter ? opts.dateFilter.toISOString().substring(0, 10) : null,
      sheetsFound: sheets.length,
      totalRows,
      totalOrders,
      resolvedLkw,
      unresolvedLkw,
    },
    sheets: sheetSummaries,
    issues: allIssues.slice(0, 100),
  };
}

export async function executeDailyPlanImport(opts: {
  dateFilter?: Date;
}): Promise<DailyPlanImportExecuteResult> {
  const filePath = requireWorkbookPath();
  const year = detectWorkbookYear(filePath);
  const sheets = await parseWorkbook(opts);
  const preview = await previewDailyPlanImport(opts);

  const importRun = await prisma.importRun.create({
    data: {
      sourceType: "excel-daily-plan",
      sourceFileName: nodePath.basename(filePath),
      status: ImportStatus.VALIDATED,
      validationStats: toJson(preview),
    },
  });

  let ordersApplied = 0;
  let assignmentsApplied = 0;
  let stagingRowsApplied = 0;
  let importErrorsApplied = 0;

  try {
    // Process each sheet in its own transaction to avoid the 120-second interactive-transaction limit
    for (const sheet of sheets) {
      await prisma.$transaction(
        async (tx) => {
          for (const row of sheet.rows) {
            await tx.dailyPlanImportRow.create({
              data: {
                importRunId: importRun.id,
                sourceSheet: row.sourceSheet,
                sourceRow: row.sourceRow,
                planningDate: row.planningDate,
                wagenRaw: row.wagenRaw,
                lkwNumberRaw: row.lkwNumberRaw,
                lkwId: row.lkwId,
                runde: row.runde,
                auftragText: row.auftragText || null,
                plz: row.plz,
                country: row.country,
                info: row.info,
                statusRaw: row.statusRaw,
                normalizedStatus: row.normalizedStatus,
                validationCode: row.validationCode,
                validationMessage: row.validationMessage,
                rawPayload: toJson(row.rawPayload),
              },
            });
            stagingRowsApplied += 1;

            const description = row.auftragText || `Runde ${row.runde}`;
            const order = await tx.order.create({
              data: {
                planningDate: row.planningDate,
                runde: row.runde,
                description,
                plz: row.plz,
                country: row.country,
                info: row.info,
                status: row.normalizedStatus,
                problemReason: row.validationMessage,
              },
            });
            ordersApplied += 1;

            if (row.lkwId) {
              await tx.assignment.create({
                data: {
                  orderId: order.id,
                  lkwId: row.lkwId,
                  planningDate: row.planningDate,
                  runde: row.runde,
                  status: row.normalizedStatus,
                  problemReason: row.validationMessage,
                  rawPayload: toJson({ source: "daily-plan-import", importRunId: importRun.id }),
                },
              });
              assignmentsApplied += 1;
            }
          }

          for (const issue of sheet.issues) {
            await tx.importError.create({
              data: {
                importRunId: importRun.id,
                rowNumber: issue.rowNumber,
                fieldName: issue.fieldName,
                severity: issue.severity,
                code: issue.code,
                message: issue.message,
                rawPayload: toJson(issue.rawPayload),
              },
            });
            importErrorsApplied += 1;
          }
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
    }

    await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        status: ImportStatus.EXECUTED,
        executedAt: new Date(),
        validationStats: toJson({
          ...preview,
          applied: {
            orders: ordersApplied,
            assignments: assignmentsApplied,
            stagingRows: stagingRowsApplied,
            importErrors: importErrorsApplied,
          },
        }),
      },
    });

    await prisma.auditLog.create({
      data: {
        eventType: AuditEventType.IMPORT_EXECUTED,
        entityType: "ImportRun",
        entityId: importRun.id,
        message: `Daily plan import executed from ${nodePath.basename(filePath)}`,
        after: toJson({
          orders: ordersApplied,
          assignments: assignmentsApplied,
          stagingRows: stagingRowsApplied,
          importErrors: importErrorsApplied,
          year,
          dateFilter: opts.dateFilter?.toISOString().substring(0, 10) ?? null,
        }),
      },
    });
  } catch (error) {
    await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        status: ImportStatus.FAILED,
        validationStats: toJson({
          ...preview,
          error: error instanceof Error ? error.message : "Import failed",
        }),
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
      stagingRows: stagingRowsApplied,
      importErrors: importErrorsApplied,
    },
  };
}
