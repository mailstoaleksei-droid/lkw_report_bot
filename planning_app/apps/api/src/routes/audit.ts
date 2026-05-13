import { AuditEventType } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import type { AppConfig } from "../config.js";
import { prisma } from "../prisma.js";

const auditQuerySchema = z.object({
  entityType: z.string().trim().optional(),
  entityId: z.string().trim().optional(),
  orderId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  eventType: z.nativeEnum(AuditEventType).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function registerAuditRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get("/api/audit-log", async (request, reply) => {
    const user = await requireUser(request, reply, config, "MANAGER");
    if (!user) return;

    const parsed = auditQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid audit query" });
    }

    const query = parsed.data;
    const items = await prisma.auditLog.findMany({
      where: {
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(query.assignmentId ? { assignmentId: query.assignmentId } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.eventType ? { eventType: query.eventType } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.limit,
      select: {
        id: true,
        eventType: true,
        entityType: true,
        entityId: true,
        orderId: true,
        assignmentId: true,
        message: true,
        before: true,
        after: true,
        createdAt: true,
        order: {
          select: {
            id: true,
            planningDate: true,
            runde: true,
            description: true,
            status: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    return { ok: true, items };
  });
}
