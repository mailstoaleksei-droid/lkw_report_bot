import { AuditEventType, MasterStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import type { AppConfig } from "../config.js";
import { lkwPlanningWhere, toPlanningDate } from "../domain/planning-availability.js";
import { prisma } from "../prisma.js";

const querySchema = z.object({
  q: z.string().optional(),
  companyId: z.string().uuid().optional(),
  status: z.nativeEnum(MasterStatus).optional(),
  activeOnly: z.coerce.boolean().default(false),
  planningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

const updateSchema = z.object({
  number: z.string().trim().min(1).max(64).optional(),
  type: z.string().trim().max(64).nullable().optional(),
  status: z.nativeEnum(MasterStatus).optional(),
  soldDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  returnedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional(),
});

const createSchema = z.object({
  number: z.string().trim().min(1).max(64),
  type: z.string().trim().max(64).nullable().optional(),
  status: z.nativeEnum(MasterStatus).default(MasterStatus.ACTIVE),
  soldDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  returnedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isActive: z.boolean().default(true),
});

function dateOrNull(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function cleanText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim() || "";
  return trimmed || null;
}

function formatValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function buildChangeMessage(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const changes = Object.keys(after)
    .filter((key) => formatValue(before[key]) !== formatValue(after[key]))
    .map((key) => `${key}: ${formatValue(before[key])} -> ${formatValue(after[key])}`);
  return changes.length ? `LKW updated: ${changes.join("; ")}` : "LKW update requested without changes";
}

export async function registerLkwRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get("/api/lkw", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid query" });
    }

    const { q, companyId, status, activeOnly, planningDate, limit } = parsed.data;
    const dateAwareActiveWhere = activeOnly && planningDate
      ? lkwPlanningWhere(toPlanningDate(planningDate))
      : {};
    const items = await prisma.lkw.findMany({
      where: {
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
        ...(status ? { status } : {}),
        ...(activeOnly && !planningDate ? {
          isActive: true,
          status: { notIn: [MasterStatus.INACTIVE, MasterStatus.SOLD, MasterStatus.RETURNED] },
        } : {}),
        ...dateAwareActiveWhere,
        ...(q ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { type: { contains: q, mode: "insensitive" } },
            { aliases: { some: { alias: { contains: q, mode: "insensitive" } } } },
          ],
        } : {}),
      },
      orderBy: [{ number: "asc" }],
      take: limit,
      select: {
        id: true,
        externalId: true,
        number: true,
        type: true,
        status: true,
        rawStatus: true,
        soldDate: true,
        returnedDate: true,
        isActive: true,
        company: { select: { id: true, name: true } },
        aliases: { select: { alias: true, source: true }, orderBy: { alias: "asc" } },
      },
    });

    return { ok: true, items };
  });

  app.post("/api/lkw", async (request, reply) => {
    const user = await requireUser(request, reply, config, "MANAGER");
    if (!user) return;

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid LKW payload" });
    }

    const input = parsed.data;
    const exists = await prisma.lkw.findUnique({ where: { number: input.number }, select: { id: true } });
    if (exists) {
      return reply.code(409).send({ ok: false, error: "LKW number already exists" });
    }

    const created = await prisma.$transaction(async (tx) => {
      const saved = await tx.lkw.create({
        data: {
          number: input.number,
          type: cleanText(input.type),
          status: input.status,
          rawStatus: input.status,
          soldDate: dateOrNull(input.soldDate) ?? null,
          returnedDate: dateOrNull(input.returnedDate) ?? null,
          isActive: input.isActive,
          rawPayload: { source: "manual-planning-ui" },
        },
        select: {
          id: true,
          externalId: true,
          number: true,
          type: true,
          status: true,
          rawStatus: true,
          soldDate: true,
          returnedDate: true,
          isActive: true,
          company: { select: { id: true, name: true } },
          aliases: { select: { alias: true, source: true }, orderBy: { alias: "asc" } },
        },
      });

      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.STATUS_CHANGED,
          entityType: "Lkw",
          entityId: saved.id,
          userId: user.id,
          message: `LKW created: ${saved.number}`,
          after: saved,
        },
      });

      return saved;
    });

    return { ok: true, item: created };
  });

  app.patch("/api/lkw/:id", async (request, reply) => {
    const user = await requireUser(request, reply, config, "MANAGER");
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const parsed = updateSchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid LKW update" });
    }

    const before = await prisma.lkw.findFirst({
      where: { id: params.data.id, deletedAt: null },
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        soldDate: true,
        returnedDate: true,
        isActive: true,
      },
    });
    if (!before) {
      return reply.code(404).send({ ok: false, error: "LKW not found" });
    }

    const input = parsed.data;
    if (input.number && input.number !== before.number) {
      const exists = await prisma.lkw.findUnique({ where: { number: input.number }, select: { id: true } });
      if (exists && exists.id !== before.id) {
        return reply.code(409).send({ ok: false, error: "LKW number already exists" });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.lkw.update({
        where: { id: before.id },
        data: {
          ...(input.number !== undefined ? { number: input.number } : {}),
          ...(input.type !== undefined ? { type: cleanText(input.type) } : {}),
          ...(input.status !== undefined ? { status: input.status, rawStatus: input.status } : {}),
          ...(input.soldDate !== undefined ? { soldDate: dateOrNull(input.soldDate) } : {}),
          ...(input.returnedDate !== undefined ? { returnedDate: dateOrNull(input.returnedDate) } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: {
          id: true,
          number: true,
          type: true,
          status: true,
          soldDate: true,
          returnedDate: true,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.STATUS_CHANGED,
          entityType: "Lkw",
          entityId: saved.id,
          userId: user.id,
          message: buildChangeMessage(before, saved),
          before,
          after: saved,
        },
      });

      return saved;
    });

    return { ok: true, item: updated };
  });
}
