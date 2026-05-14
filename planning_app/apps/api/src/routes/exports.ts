import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import type { AppConfig } from "../config.js";
import { prisma } from "../prisma.js";

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

function planningRange(dateOnly: string, scope: "day" | "week" | "month"): { start: Date; end: Date } {
  const start = new Date(`${dateOnly}T00:00:00.000Z`);
  if (scope === "week") {
    const day = start.getUTCDay() || 7;
    start.setUTCDate(start.getUTCDate() - day + 1);
  }
  if (scope === "month") {
    start.setUTCDate(1);
  }
  const end = new Date(start);
  if (scope === "week") {
    end.setUTCDate(end.getUTCDate() + 7);
  } else if (scope === "month") {
    end.setUTCMonth(end.getUTCMonth() + 1);
  } else {
    end.setUTCDate(end.getUTCDate() + 1);
  }
  return { start, end };
}

function xmlCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<Cell><Data ss:Type="String">${escaped}</Data></Cell>`;
}

function xmlRow(values: unknown[]): string {
  return `<Row>${values.map(xmlCell).join("")}</Row>`;
}

function includesFilter(value: string | null | undefined, filter: string | undefined): boolean {
  return !filter || (value || "").toLowerCase().includes(filter.toLowerCase());
}

function textValue(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function matchesExportFilters(row: ExportRow, query: ExportQuery): boolean {
  const auftragMatch = includesFilter(row.auftrag, query.auftrag);
  const lkwMatch = includesFilter(row.lkw === "-" ? "" : row.lkw, query.lkw);
  const lkwMissingMatch = !query.lkwMissing || row.lkw === "-";
  const driverMatch = includesFilter(row.driver === "-" ? "" : row.driver, query.driver);
  const companyMatch = !query.company || [
    row.lkwCompany,
    row.driverCompany,
  ].some((value) => includesFilter(value, query.company));
  const statusMatch = !query.status || row.status === query.status;
  const rundeMatch = !query.runde || String(row.runde) === query.runde;
  return auftragMatch && lkwMatch && lkwMissingMatch && driverMatch && companyMatch && statusMatch && rundeMatch;
}

async function loadExportRows(query: ExportQuery): Promise<ExportRow[]> {
  const { start, end } = planningRange(query.date, query.scope);
  const [assignments, unassignedOrders] = await Promise.all([
    prisma.assignment.findMany({
      where: {
        planningDate: { gte: start, lt: end },
        deletedAt: null,
      },
      orderBy: [
        { lkw: { number: "asc" } },
        { runde: "asc" },
        { createdAt: "asc" },
      ],
      include: {
        order: true,
        lkw: { include: { company: true } },
        driver: { include: { company: true } },
        chassis: true,
      },
    }),
    prisma.order.findMany({
      where: {
        planningDate: { gte: start, lt: end },
        deletedAt: null,
        assignments: { none: { deletedAt: null } },
      },
      orderBy: [{ runde: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const assignedRows: ExportRow[] = assignments.map((row) => ({
    lkw: textValue(row.lkw?.number),
    lkwCompany: textValue(row.lkw?.company?.name),
    driver: textValue(row.driver?.fullName),
    driverCompany: textValue(row.driver?.company?.name),
    chassis: textValue(row.chassis?.number),
    runde: row.runde,
    auftrag: textValue(row.order.description),
    customer: textValue(row.order.customer),
    plz: textValue(row.order.plz),
    city: textValue(row.order.city),
    country: textValue(row.order.country),
    time: textValue(row.order.plannedTime),
    info: textValue(row.order.info),
    status: row.order.status || row.status,
    problem: textValue(row.order.problemReason || row.problemReason),
  }));
  const unassignedRows: ExportRow[] = unassignedOrders.map((order) => ({
    lkw: "-",
    lkwCompany: "-",
    driver: "-",
    driverCompany: "-",
    chassis: "-",
    runde: order.runde,
    auftrag: textValue(order.description),
    customer: textValue(order.customer),
    plz: textValue(order.plz),
    city: textValue(order.city),
    country: textValue(order.country),
    time: textValue(order.plannedTime),
    info: textValue(order.info),
    status: order.status,
    problem: textValue(order.problemReason),
  }));

  return [...assignedRows, ...unassignedRows]
    .filter((row) => matchesExportFilters(row, query))
    .sort((a, b) => a.runde - b.runde || a.lkw.localeCompare(b.lkw) || a.auftrag.localeCompare(b.auftrag));
}

function pdfEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "?");
}

function fit(value: string | number, width: number): string {
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > width ? `${text.slice(0, Math.max(width - 1, 0))}.` : text.padEnd(width, " ");
}

function makePdf(lines: string[]): Buffer {
  const objects: string[] = [];
  const content = [
    "BT",
    "/F1 8 Tf",
    "10 TL",
    "36 560 Td",
    ...lines.map((line, index) => `${index === 0 ? "" : "T*"}(${pdfEscape(line)}) Tj`),
    "ET",
  ].join("\n");
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
  objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);

  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

export async function registerExportRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get("/api/exports/tagesplanung.xls", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const parsed = exportQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid export query" });
    }

    const query = parsed.data;
    const rows = await loadExportRows(query);
    const header = [
      "LKW",
      "Runde",
      "Auftrag",
      "Driver",
      "Chassis",
      "Customer",
      "PLZ",
      "City",
      "Country",
      "Time",
      "Info",
      "Status",
      "Problem",
    ];
    const tableRows = [
      xmlRow(header),
      ...rows.map((row) => [
        row.lkw,
        row.runde,
        row.auftrag,
        row.driver,
        row.chassis,
        row.customer,
        row.plz,
        row.city,
        row.country,
        row.time,
        row.info,
        row.status,
        row.problem,
      ]).map(xmlRow),
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Tagesplanung">
  <Table>
   ${tableRows.join("\n   ")}
  </Table>
 </Worksheet>
</Workbook>`;
    const fileName = `tagesplanung-${query.scope}-${query.date}.xls`;

    await prisma.exportLog.create({
      data: {
        exportType: "tagesplanung",
        format: "xls",
        filters: {
          date: query.date,
          scope: query.scope,
          auftrag: query.auftrag || null,
          lkw: query.lkw || null,
          lkwMissing: query.lkwMissing || null,
          driver: query.driver || null,
          company: query.company || null,
          status: query.status || null,
          runde: query.runde || null,
        },
        outputPath: fileName,
        createdById: user.id,
      },
    });

    reply.header("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
    return reply.send(body);
  });

  app.get("/api/exports/tagesplanung.pdf", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const parsed = exportQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid export query" });
    }

    const query = parsed.data;
    const rows = await loadExportRows(query);
    const fileName = `tagesplanung-${query.scope}-${query.date}.pdf`;
    const header = `${fit("LKW", 12)} ${fit("R", 2)} ${fit("Auftrag", 30)} ${fit("Driver", 22)} ${fit("Country", 8)} ${fit("Status", 9)} ${fit("Problem", 28)}`;
    const separator = "-".repeat(header.length);
    const lines = [
      `Tagesplanung ${query.scope} ${query.date}`,
      `Rows: ${rows.length}`,
      "",
      header,
      separator,
      ...rows.slice(0, 48).map((row) => [
        fit(row.lkw, 12),
        fit(row.runde, 2),
        fit(row.auftrag, 30),
        fit(row.driver, 22),
        fit(row.country, 8),
        fit(row.status, 9),
        fit(row.problem, 28),
      ].join(" ")),
    ];
    if (rows.length > 48) {
      lines.push(`... ${rows.length - 48} more rows. Use Excel export for the full list.`);
    }

    await prisma.exportLog.create({
      data: {
        exportType: "tagesplanung",
        format: "pdf",
        filters: {
          date: query.date,
          scope: query.scope,
          auftrag: query.auftrag || null,
          lkw: query.lkw || null,
          lkwMissing: query.lkwMissing || null,
          driver: query.driver || null,
          company: query.company || null,
          status: query.status || null,
          runde: query.runde || null,
        },
        outputPath: fileName,
        createdById: user.id,
      },
    });

    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
    return reply.send(makePdf(lines));
  });
}
