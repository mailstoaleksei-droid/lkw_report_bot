import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import type { AppConfig } from "../config.js";
import { prisma } from "../prisma.js";

const exportQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function dateRange(dateOnly: string): { start: Date; end: Date } {
  const start = new Date(`${dateOnly}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function registerExportRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get("/api/exports/tagesplanung.csv", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const parsed = exportQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid export query" });
    }

    const { start, end } = dateRange(parsed.data.date);
    const rows = await prisma.assignment.findMany({
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
        lkw: true,
        driver: true,
        chassis: true,
      },
    });

    const header = [
      "LKW",
      "LKW status",
      "Driver",
      "Driver status",
      "Chassis",
      "Runde",
      "Auftrag",
      "Customer",
      "PLZ",
      "City",
      "Country",
      "Time",
      "Info",
      "Status",
      "Problem",
    ];
    const csvRows = [
      header.map(csvCell).join(";"),
      ...rows.map((row) => [
        row.lkw?.number,
        row.lkw?.status,
        row.driver?.fullName,
        row.driver?.status,
        row.chassis?.number,
        row.runde,
        row.order.description,
        row.order.customer,
        row.order.plz,
        row.order.city,
        row.order.country,
        row.order.plannedTime,
        row.order.info,
        row.order.status,
        row.order.problemReason || row.problemReason,
      ].map(csvCell).join(";")),
    ];
    const body = `\uFEFF${csvRows.join("\r\n")}\r\n`;
    const fileName = `tagesplanung-${parsed.data.date}.csv`;

    await prisma.exportLog.create({
      data: {
        exportType: "tagesplanung",
        format: "csv",
        filters: { date: parsed.data.date },
        outputPath: fileName,
        createdById: user.id,
      },
    });

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
    return reply.send(body);
  });
}
