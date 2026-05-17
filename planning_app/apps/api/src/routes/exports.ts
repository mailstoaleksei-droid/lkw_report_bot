import { Prisma, MasterStatus } from "@prisma/client";
import ExcelJS from "exceljs";
import type { FastifyInstance } from "fastify";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import type { AppConfig } from "../config.js";
import { prisma } from "../prisma.js";

// ── shared types ──────────────────────────────────────────────────────────────

type ExportQuery = z.infer<typeof exportQuerySchema>;

type ExportRow = {
  lkw: string;
  lkwCompany: string;
  driver: string;
  driverCompany: string;
  chassis: string;
  runde: number;
  auftrag: string;
  customer: string;
  plz: string;
  city: string;
  country: string;
  time: string;
  info: string;
  status: string;
  problem: string;
};

const exportQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scope: z.enum(["day", "week", "month"]).default("day"),
  auftrag: z.string().trim().optional(),
  lkw: z.string().trim().optional(),
  lkwMissing: z.string().trim().optional(),
  driver: z.string().trim().optional(),
  company: z.string().trim().optional(),
  status: z.string().trim().optional(),
  runde: z.string().regex(/^\d+$/).optional(),
});

// ── helpers ───────────────────────────────────────────────────────────────────

function planningRange(dateOnly: string, scope: "day" | "week" | "month"): { start: Date; end: Date } {
  const start = new Date(`${dateOnly}T00:00:00.000Z`);
  if (scope === "week") {
    const day = start.getUTCDay() || 7;
    start.setUTCDate(start.getUTCDate() - day + 1);
  }
  if (scope === "month") start.setUTCDate(1);
  const end = new Date(start);
  if (scope === "week") end.setUTCDate(end.getUTCDate() + 7);
  else if (scope === "month") end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function includesFilter(value: string | null | undefined, filter: string | undefined): boolean {
  return !filter || (value || "").toLowerCase().includes(filter.toLowerCase());
}

function tv(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function matchesExportFilters(row: ExportRow, query: ExportQuery): boolean {
  return (
    includesFilter(row.auftrag, query.auftrag) &&
    includesFilter(row.lkw === "-" ? "" : row.lkw, query.lkw) &&
    (!query.lkwMissing || row.lkw === "-") &&
    includesFilter(row.driver === "-" ? "" : row.driver, query.driver) &&
    (!query.company || [row.lkwCompany, row.driverCompany].some((v) => includesFilter(v, query.company))) &&
    (!query.status || row.status === query.status) &&
    (!query.runde || String(row.runde) === query.runde)
  );
}

async function loadExportRows(query: ExportQuery): Promise<ExportRow[]> {
  const { start, end } = planningRange(query.date, query.scope);
  const [assignments, unassignedOrders] = await Promise.all([
    prisma.assignment.findMany({
      where: { planningDate: { gte: start, lt: end }, deletedAt: null },
      orderBy: [{ lkw: { number: "asc" } }, { runde: "asc" }, { createdAt: "asc" }],
      include: {
        order: true,
        lkw: { include: { company: true } },
        driver: { include: { company: true } },
        chassis: true,
      },
    }),
    prisma.order.findMany({
      where: { planningDate: { gte: start, lt: end }, deletedAt: null, assignments: { none: { deletedAt: null } } },
      orderBy: [{ runde: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const assignedRows: ExportRow[] = assignments.map((row) => ({
    lkw: tv(row.lkw?.number),
    lkwCompany: tv(row.lkw?.company?.name),
    driver: tv(row.driver?.fullName),
    driverCompany: tv(row.driver?.company?.name),
    chassis: tv(row.chassis?.number),
    runde: row.runde,
    auftrag: tv(row.order.description),
    customer: tv(row.order.customer),
    plz: tv(row.order.plz),
    city: tv(row.order.city),
    country: tv(row.order.country),
    time: tv(row.order.plannedTime),
    info: tv(row.order.info),
    status: row.order.status || row.status,
    problem: tv(row.order.problemReason || row.problemReason),
  }));

  const unassignedRows: ExportRow[] = unassignedOrders.map((order) => ({
    lkw: "-",
    lkwCompany: "-",
    driver: "-",
    driverCompany: "-",
    chassis: "-",
    runde: order.runde,
    auftrag: tv(order.description),
    customer: tv(order.customer),
    plz: tv(order.plz),
    city: tv(order.city),
    country: tv(order.country),
    time: tv(order.plannedTime),
    info: tv(order.info),
    status: order.status,
    problem: tv(order.problemReason),
  }));

  return [...assignedRows, ...unassignedRows]
    .filter((row) => matchesExportFilters(row, query))
    .sort((a, b) => a.runde - b.runde || a.lkw.localeCompare(b.lkw) || a.auftrag.localeCompare(b.auftrag));
}

async function writeExportLog(
  userId: string,
  format: string,
  exportType: string,
  filters: Prisma.JsonObject,
  fileName: string,
): Promise<void> {
  await prisma.exportLog.create({
    data: { exportType, format, filters, outputPath: fileName, createdById: userId },
  });
}

// ── ExcelJS helpers ───────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1864AB" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD8DEE8" } },
  left: { style: "thin", color: { argb: "FFD8DEE8" } },
  bottom: { style: "thin", color: { argb: "FFD8DEE8" } },
  right: { style: "thin", color: { argb: "FFD8DEE8" } },
};

function applyHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = THIN_BORDER;
  });
  row.height = 22;
}

function applyDataRow(row: ExcelJS.Row, fillArgb = "FFFFFFFF"): void {
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
    cell.font = { size: 10, color: { argb: "FF111827" } };
    cell.alignment = { horizontal: col === 1 ? "left" : "center", vertical: "middle", wrapText: false };
    cell.border = THIN_BORDER;
  });
  row.height = 17;
}

async function buildTagesplanungXlsx(rows: ExportRow[], title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "GROO Fleet Portal";
  const ws = wb.addWorksheet(title);

  const cols = [
    { header: "LKW", key: "lkw", width: 12 },
    { header: "Runde", key: "runde", width: 8 },
    { header: "Auftrag", key: "auftrag", width: 30 },
    { header: "Driver", key: "driver", width: 22 },
    { header: "Chassis", key: "chassis", width: 14 },
    { header: "Customer", key: "customer", width: 20 },
    { header: "PLZ", key: "plz", width: 8 },
    { header: "City", key: "city", width: 18 },
    { header: "Country", key: "country", width: 10 },
    { header: "Time", key: "time", width: 10 },
    { header: "Info", key: "info", width: 24 },
    { header: "Status", key: "status", width: 12 },
    { header: "Problem", key: "problem", width: 28 },
  ];

  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  applyHeader(ws.getRow(1));

  const ALT = "FFEEF2FF";
  rows.forEach((row, i) => {
    const r = ws.addRow({
      lkw: row.lkw, runde: row.runde, auftrag: row.auftrag, driver: row.driver,
      chassis: row.chassis, customer: row.customer, plz: row.plz, city: row.city,
      country: row.country, time: row.time, info: row.info, status: row.status, problem: row.problem,
    });
    applyDataRow(r, i % 2 === 1 ? ALT : "FFFFFFFF");
  });

  ws.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
  ws.autoFilter = { from: "A1", to: `M1` };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function buildTagesplanungPdf(rows: ExportRow[], title: string, subtitle: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 28 });
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const PAGE_W = doc.page.width - 56;
    const COLS = [
      { label: "LKW", w: 0.08 },
      { label: "R", w: 0.04 },
      { label: "Auftrag", w: 0.18 },
      { label: "Driver", w: 0.14 },
      { label: "Customer", w: 0.12 },
      { label: "PLZ/City", w: 0.12 },
      { label: "Land", w: 0.06 },
      { label: "Zeit", w: 0.07 },
      { label: "Status", w: 0.08 },
      { label: "Problem", w: 0.11 },
    ];

    const colWidths = COLS.map((c) => c.w * PAGE_W);
    const ROW_H = 16;
    const HEADER_H = 20;

    // Title
    doc.fontSize(14).font("Helvetica-Bold").text(title, 28, 20);
    doc.fontSize(9).font("Helvetica").text(subtitle, 28, 38);

    let y = 58;

    const drawRow = (values: string[], isHeader: boolean): void => {
      const h = isHeader ? HEADER_H : ROW_H;
      if (isHeader) {
        doc.rect(28, y, PAGE_W, h).fill("#1864AB");
      } else {
        doc.rect(28, y, PAGE_W, h).fill("#FFFFFF");
      }
      doc.strokeColor("#D8DEE8").lineWidth(0.4);
      let x = 28;
      values.forEach((val, i) => {
        doc.rect(x, y, colWidths[i], h).stroke();
        doc
          .fillColor(isHeader ? "#FFFFFF" : "#111827")
          .fontSize(isHeader ? 8 : 7.5)
          .font(isHeader ? "Helvetica-Bold" : "Helvetica")
          .text(val.slice(0, 40), x + 2, y + (h - 8) / 2, { width: colWidths[i] - 4, lineBreak: false });
        x += colWidths[i];
      });
      y += h;
    };

    drawRow(COLS.map((c) => c.label), true);

    for (const row of rows) {
      if (y > doc.page.height - 40) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 28 });
        y = 28;
        drawRow(COLS.map((c) => c.label), true);
      }
      drawRow([
        row.lkw, String(row.runde), row.auftrag, row.driver,
        row.customer, `${row.plz} ${row.city}`.trim(), row.country,
        row.time, row.status, row.problem,
      ], false);
    }

    doc.end();
  });
}

// ── LKW-Liste xlsx ────────────────────────────────────────────────────────────

async function buildLkwListeXlsx(): Promise<Buffer> {
  const lkws = await prisma.lkw.findMany({
    where: { deletedAt: null },
    orderBy: [{ number: "asc" }],
    include: { company: true },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "GROO Fleet Portal";
  const ws = wb.addWorksheet("LKW-Liste");

  ws.columns = [
    { header: "Nummer", key: "number", width: 14 },
    { header: "Typ", key: "type", width: 14 },
    { header: "Firma", key: "company", width: 20 },
    { header: "Status", key: "status", width: 14 },
    { header: "Drucker", key: "drucker", width: 18 },
    { header: "Aktiv", key: "isActive", width: 8 },
    { header: "Verkauft am", key: "soldDate", width: 14 },
    { header: "Rückgabe am", key: "returnedDate", width: 14 },
  ];
  applyHeader(ws.getRow(1));

  const STATUS_COLORS: Partial<Record<string, string>> = {
    ACTIVE: "FFDCFCE7",
    WORKSHOP: "FFFED7AA",
    SOLD: "FFE5E7EB",
    RETURNED: "FFD1D5DB",
    RESERVE: "FFDDD6FE",
    INACTIVE: "FFFCA5A5",
  };

  const druckerFromPayload = (raw: unknown): string => {
    if (!raw || typeof raw !== "object") return "";
    const p = raw as Record<string, unknown>;
    const v = p["Drucker"] ?? p["drucker"] ?? p["tachograph"] ?? p["Tachograph"];
    return v ? String(v).trim() : "";
  };

  lkws.forEach((lkw, i) => {
    const r = ws.addRow({
      number: lkw.number,
      type: (lkw as Record<string, unknown>)["type"] ?? "",
      company: lkw.company?.name ?? "",
      status: lkw.status,
      drucker: druckerFromPayload(lkw.rawPayload),
      isActive: lkw.isActive ? "Ja" : "Nein",
      soldDate: lkw.soldDate ? lkw.soldDate.toISOString().slice(0, 10) : "",
      returnedDate: lkw.returnedDate ? lkw.returnedDate.toISOString().slice(0, 10) : "",
    });
    const fill = STATUS_COLORS[lkw.status] ?? (i % 2 === 1 ? "FFEEF2FF" : "FFFFFFFF");
    applyDataRow(r, fill);
  });

  ws.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
  ws.autoFilter = { from: "A1", to: "H1" };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── Fahrer-Liste xlsx ─────────────────────────────────────────────────────────

async function buildFahrerListeXlsx(): Promise<Buffer> {
  const drivers = await prisma.driver.findMany({
    where: { deletedAt: null },
    orderBy: [{ fullName: "asc" }],
    include: { company: true },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "GROO Fleet Portal";
  const ws = wb.addWorksheet("Fahrer-Liste");

  ws.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Firma", key: "company", width: 20 },
    { header: "Status", key: "status", width: 14 },
    { header: "Aktiv", key: "isActive", width: 8 },
    { header: "Telefon", key: "phone", width: 18 },
    { header: "Ausgeschieden am", key: "dismissedDate", width: 18 },
  ];
  applyHeader(ws.getRow(1));

  const STATUS_COLORS: Partial<Record<string, string>> = {
    ACTIVE: "FFDCFCE7",
    VACATION: "FFFEF08A",
    SICK: "FFFCA5A5",
    DISMISSED: "FFE5E7EB",
    INACTIVE: "FFD1D5DB",
  };

  drivers.forEach((d, i) => {
    const p = d as Record<string, unknown>;
    const r = ws.addRow({
      name: d.fullName,
      company: d.company?.name ?? "",
      status: d.status,
      isActive: d.isActive ? "Ja" : "Nein",
      phone: String(p["phone"] ?? p["phoneNumber"] ?? ""),
      dismissedDate: d.dismissedDate ? d.dismissedDate.toISOString().slice(0, 10) : "",
    });
    const fill = STATUS_COLORS[d.status ?? "ACTIVE"] ?? (i % 2 === 1 ? "FFEEF2FF" : "FFFFFFFF");
    applyDataRow(r, fill);
  });

  ws.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
  ws.autoFilter = { from: "A1", to: "F1" };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── route registration ────────────────────────────────────────────────────────

export async function registerExportRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {

  // ── Tagesplanung / Wochenplan xlsx ──────────────────────────────────────────
  app.get("/api/exports/tagesplanung.xlsx", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const parsed = exportQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "Invalid query" });

    const query = parsed.data;
    const rows = await loadExportRows(query);
    const title = query.scope === "week" ? "Wochenplan" : query.scope === "month" ? "Monatsplan" : "Tagesplanung";
    const fileName = `${title.toLowerCase()}-${query.scope}-${query.date}.xlsx`;

    const buf = await buildTagesplanungXlsx(rows, title);
    await writeExportLog(user.id, "xlsx", query.scope === "week" ? "wochenplan" : "tagesplanung",
      { date: query.date, scope: query.scope, auftrag: query.auftrag, lkw: query.lkw, driver: query.driver, company: query.company, status: query.status },
      fileName);

    void reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .send(buf);
  });

  // ── Tagesplanung pdf ────────────────────────────────────────────────────────
  app.get("/api/exports/tagesplanung.pdf", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const parsed = exportQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "Invalid query" });

    const query = parsed.data;
    const rows = await loadExportRows(query);
    const title = query.scope === "week" ? "Wochenplan" : "Tagesplanung";
    const subtitle = `${query.scope} ${query.date}  ·  ${rows.length} Einträge`;
    const fileName = `${title.toLowerCase()}-${query.date}.pdf`;

    const buf = await buildTagesplanungPdf(rows, title, subtitle);
    await writeExportLog(user.id, "pdf", query.scope === "week" ? "wochenplan" : "tagesplanung",
      { date: query.date, scope: query.scope }, fileName);

    void reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .send(buf);
  });

  // ── Legacy XLS endpoints (kept for backward compat, redirect to xlsx) ───────
  app.get("/api/exports/tagesplanung.xls", async (request, reply) => {
    return reply.redirect(`/api/exports/tagesplanung.xlsx?${new URLSearchParams(request.query as Record<string, string>).toString()}`);
  });
  app.get("/api/exports/wochenplan.xls", async (request, reply) => {
    return reply.redirect(`/api/exports/tagesplanung.xlsx?${new URLSearchParams({ ...(request.query as Record<string, string>), scope: "week" }).toString()}`);
  });
  app.get("/api/exports/wochenplan.pdf", async (request, reply) => {
    return reply.redirect(`/api/exports/tagesplanung.pdf?${new URLSearchParams({ ...(request.query as Record<string, string>), scope: "week" }).toString()}`);
  });

  // ── LKW-Liste xlsx ──────────────────────────────────────────────────────────
  app.get("/api/exports/lkw-liste.xlsx", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const buf = await buildLkwListeXlsx();
    const fileName = `lkw-liste-${new Date().toISOString().slice(0, 10)}.xlsx`;

    await writeExportLog(user.id, "xlsx", "lkw-liste", {}, fileName);

    void reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .send(buf);
  });

  // ── Fahrer-Liste xlsx ───────────────────────────────────────────────────────
  app.get("/api/exports/fahrer-liste.xlsx", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const buf = await buildFahrerListeXlsx();
    const fileName = `fahrer-liste-${new Date().toISOString().slice(0, 10)}.xlsx`;

    await writeExportLog(user.id, "xlsx", "fahrer-liste", {}, fileName);

    void reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .send(buf);
  });

  // ── Export History ──────────────────────────────────────────────────────────
  app.get("/api/exports/history", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const parsed = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
      exportType: z.string().optional(),
    }).safeParse(request.query);

    if (!parsed.success) return reply.code(400).send({ ok: false, error: "Invalid query" });

    const { limit, offset, exportType } = parsed.data;
    const [logs, total] = await Promise.all([
      prisma.exportLog.findMany({
        where: exportType ? { exportType } : {},
        orderBy: [{ createdAt: "desc" }],
        take: limit,
        skip: offset,
        include: { createdBy: { select: { displayName: true, email: true } } },
      }),
      prisma.exportLog.count({ where: exportType ? { exportType } : {} }),
    ]);

    return {
      ok: true,
      total,
      offset,
      limit,
      logs: logs.map((l) => ({
        id: l.id,
        exportType: l.exportType,
        format: l.format,
        filters: l.filters,
        outputPath: l.outputPath,
        createdAt: l.createdAt.toISOString(),
        createdBy: l.createdBy ? `${l.createdBy.displayName ?? ""} <${l.createdBy.email}>`.trim() : null,
      })),
    };
  });
}
