import { MasterStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import type { AppConfig } from "../config.js";
import { prisma } from "../prisma.js";

const querySchema = z.object({
  q: z.string().optional(),
  companyId: z.string().uuid().optional(),
  status: z.nativeEnum(MasterStatus).optional(),
  activeOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function registerDriverRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get("/api/drivers", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid query" });
    }

    const { q, companyId, status, activeOnly, limit } = parsed.data;
    const items = await prisma.driver.findMany({
      where: {
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
        ...(status ? { status } : {}),
        ...(activeOnly ? {
          isActive: true,
          status: { notIn: [MasterStatus.INACTIVE, MasterStatus.DISMISSED] },
        } : {}),
        ...(q ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { surname: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { externalId: { contains: q, mode: "insensitive" } },
          ],
        } : {}),
      },
      orderBy: [{ fullName: "asc" }],
      take: limit,
      select: {
        id: true,
        externalId: true,
        fullName: true,
        surname: true,
        phone: true,
        status: true,
        rawStatus: true,
        dismissedDate: true,
        isActive: true,
        telegramLookupHint: true,
        company: { select: { id: true, name: true } },
      },
    });

    return { ok: true, items };
  });
}
