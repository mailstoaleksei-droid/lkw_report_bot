import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import type { AppConfig } from "../config.js";
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
}

function requestImportError(reply: FastifyReply, error: unknown): void {
  const message = error instanceof Error ? error.message : "Import failed";
  reply.code(500).send({ ok: false, error: message });
}
