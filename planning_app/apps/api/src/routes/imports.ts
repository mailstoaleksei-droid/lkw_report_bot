import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import type { AppConfig } from "../config.js";
import { prisma } from "../prisma.js";
import { normalizeMasterStatus, normalizeOrderStatus } from "../domain/status-normalization.js";
import {
  executeReportingMasterImport,
  previewReportingMasterImport,
} from "../services/reporting-master-import.js";
import {
  executeReportingDriverAvailabilityImport,
  previewReportingDriverAvailabilityImport,
} from "../services/reporting-driver-availability-import.js";
import {
  executeReportingScheduleImport,
  previewReportingScheduleImport,
} from "../services/reporting-schedule-import.js";
import {
  executeLkwDriverPairingImport,
  previewLkwDriverPairingImport,
} from "../services/lkw-driver-pairing-import.js";
import {
  executeDailyPlanImport,
  previewDailyPlanImport,
} from "../services/daily-plan-import.js";

const statusPreviewSchema = z.object({
  values: z.array(z.string()).default([]),
});

export async function registerImportRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.post("/api/imports/status-preview", async (request, reply) => {
    const user = await requireUser(request, reply, config, "MANAGER");
    if (!user) return;

    const parsed = statusPreviewSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid payload" });
    }

    return {
      ok: true,
      items: parsed.data.values.map((value) => ({
        raw: value,
        masterStatus: normalizeMasterStatus(value),
        orderStatus: normalizeOrderStatus(value),
      })),
    };
  });

  app.get("/api/imports/reporting-master-data/preview", async (request, reply) => {
    const user = await requireUser(request, reply, config, "MANAGER");
    if (!user) return;

    try {
      return await previewReportingMasterImport();
    } catch (error) {
      requestImportError(reply, error);
    }
  });

  app.post("/api/imports/reporting-master-data/execute", async (request, reply) => {
    const user = await requireUser(request, reply, config, "ADMIN");
    if (!user) return;

    try {
      return await executeReportingMasterImport();
    } catch (error) {
      requestImportError(reply, error);
    }
  });

  app.get("/api/imports/reporting-schedules/preview", async (request, reply) => {
    const user = await requireUser(request, reply, config, "MANAGER");
    if (!user) return;

    try {
      return await previewReportingScheduleImport();
    } catch (error) {
      requestImportError(reply, error);
    }
  });

  app.post("/api/imports/reporting-schedules/execute", async (request, reply) => {
    const user = await requireUser(request, reply, config, "ADMIN");
    if (!user) return;

    try {
      return await executeReportingScheduleImport();
    } catch (error) {
      requestImportError(reply, error);
    }
  });

  app.get("/api/imports/reporting-driver-availability/preview", async (request, reply) => {
    const user = await requireUser(request, reply, config, "MANAGER");
    if (!user) return;

    try {
      return await previewReportingDriverAvailabilityImport();
    } catch (error) {
      requestImportError(reply, error);
    }
  });

  app.post("/api/imports/reporting-driver-availability/execute", async (request, reply) => {
    const user = await requireUser(request, reply, config, "ADMIN");
    if (!user) return;

    try {
      return await executeReportingDriverAvailabilityImport();
    } catch (error) {
      requestImportError(reply, error);
    }
  });

  app.get("/api/imports/lkw-driver-pairings/preview", async (request, reply) => {
    const user = await requireUser(request, reply, config, "MANAGER");
    if (!user) return;

    try {
      return await previewLkwDriverPairingImport();
    } catch (error) {
      requestImportError(reply, error);
    }
  });

  app.post("/api/imports/lkw-driver-pairings/execute", async (request, reply) => {
    const user = await requireUser(request, reply, config, "ADMIN");
    if (!user) return;

    try {
      return await executeLkwDriverPairingImport();
    } catch (error) {
      requestImportError(reply, error);
    }
  });

  const dailyPlanDateSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });

  app.get("/api/imports/daily-plan/preview", async (request, reply) => {
    const user = await requireUser(request, reply, config, "MANAGER");
    if (!user) return;

    const parsed = dailyPlanDateSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "Invalid date format" });

    const dateFilter = parsed.data.date ? new Date(parsed.data.date + "T00:00:00Z") : undefined;
    try {
      return await previewDailyPlanImport({ dateFilter });
    } catch (error) {
      requestImportError(reply, error);
    }
  });

  app.post("/api/imports/daily-plan/execute", async (request, reply) => {
    const user = await requireUser(request, reply, config, "ADMIN");
    if (!user) return;

    const parsed = dailyPlanDateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "Invalid date format" });

    const dateFilter = parsed.data.date ? new Date(parsed.data.date + "T00:00:00Z") : undefined;
    try {
      return await executeDailyPlanImport({ dateFilter });
    } catch (error) {
      requestImportError(reply, error);
    }
  });

  // ── GET /api/imports/history ─────────────────────────────────────────────────
  app.get("/api/imports/history", async (request, reply) => {
    const user = await requireUser(request, reply, config, "MANAGER");
    if (!user) return;

    const parsed = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
      sourceType: z.string().optional(),
      status: z.string().optional(),
    }).safeParse(request.query);

    if (!parsed.success) return reply.code(400).send({ ok: false, error: "Invalid query" });
    const { limit, offset, sourceType, status } = parsed.data;

    const where = {
      ...(sourceType ? { sourceType } : {}),
      ...(status ? { status: status as never } : {}),
    };

    const [runs, total] = await Promise.all([
      prisma.importRun.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        take: limit,
        skip: offset,
        include: {
          createdBy: { select: { displayName: true } },
          _count: { select: { errors: true } },
        },
      }),
      prisma.importRun.count({ where }),
    ]);

    return {
      ok: true,
      total,
      offset,
      limit,
      runs: runs.map((r) => ({
        id: r.id,
        sourceType: r.sourceType,
        sourceFileName: r.sourceFileName,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        executedAt: r.executedAt?.toISOString() ?? null,
        rolledBackAt: r.rolledBackAt?.toISOString() ?? null,
        errorCount: r._count.errors,
        createdBy: r.createdBy?.displayName ?? null,
      })),
    };
  });

  // ── GET /api/imports/freshness ───────────────────────────────────────────────
  // Returns last successful (EXECUTED) import per sourceType
  app.get("/api/imports/freshness", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const runs = await prisma.importRun.findMany({
      where: { status: "EXECUTED" },
      orderBy: [{ executedAt: "desc" }],
      distinct: ["sourceType"],
      select: { sourceType: true, executedAt: true, sourceFileName: true },
    });

    const freshness: Record<string, { executedAt: string; sourceFileName: string }> = {};
    for (const r of runs) {
      freshness[r.sourceType] = {
        executedAt: r.executedAt?.toISOString() ?? r.executedAt?.toString() ?? "",
        sourceFileName: r.sourceFileName,
      };
    }

    return { ok: true, freshness };
  });
}

function requestImportError(reply: FastifyReply, error: unknown): void {
  const message = error instanceof Error ? error.message : "Import failed";
  reply.code(500).send({ ok: false, error: message });
}
