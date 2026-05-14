import { MasterStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import type { AppConfig } from "../config.js";
import { driverPlanningWhere, toPlanningDate } from "../domain/planning-availability.js";
import { prisma } from "../prisma.js";

const querySchema = z.object({
  q: z.string().optional(),
  companyId: z.string().uuid().optional(),
  status: z.nativeEnum(MasterStatus).optional(),
  activeOnly: z.coerce.boolean().default(false),
  planningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

    const { q, companyId, status, activeOnly, planningDate, limit } = parsed.data;
    const selectedPlanningDate = planningDate ? toPlanningDate(planningDate) : new Date("1900-01-01T00:00:00.000Z");
    const dateAwareActiveWhere = activeOnly && planningDate
      ? driverPlanningWhere(selectedPlanningDate)
      : {};
    const items = await prisma.driver.findMany({
      where: {
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
        ...(status ? { status } : {}),
        ...(activeOnly && !planningDate ? {
          isActive: true,
          status: { notIn: [MasterStatus.INACTIVE, MasterStatus.DISMISSED] },
        } : {}),
        ...dateAwareActiveWhere,
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
        availability: {
          where: { date: selectedPlanningDate },
          select: { status: true, rawStatus: true, source: true },
        },
      },
    });

    return { ok: true, items };
  });
}
