import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { normalizeMasterStatus, normalizeOrderStatus } from "../domain/status-normalization.js";
import {
  executeReportingMasterImport,
  previewReportingMasterImport,
} from "../services/reporting-master-import.js";

const statusPreviewSchema = z.object({
  values: z.array(z.string()).default([]),
});

export async function registerImportRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/imports/status-preview", async (request, reply) => {
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

  app.get("/api/imports/reporting-master-data/preview", async (_request, reply) => {
    try {
      return await previewReportingMasterImport();
    } catch (error) {
      requestImportError(reply, error);
    }
  });

  app.post("/api/imports/reporting-master-data/execute", async (_request, reply) => {
    try {
      return await executeReportingMasterImport();
    } catch (error) {
      requestImportError(reply, error);
    }
  });
}

function requestImportError(reply: FastifyReply, error: unknown): void {
  const message = error instanceof Error ? error.message : "Import failed";
  reply.code(500).send({ ok: false, error: message });
}
