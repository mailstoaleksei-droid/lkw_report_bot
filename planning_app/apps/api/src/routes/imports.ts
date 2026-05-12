import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { normalizeMasterStatus, normalizeOrderStatus } from "../domain/status-normalization.js";

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
}

