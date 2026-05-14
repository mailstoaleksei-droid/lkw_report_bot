import { AuditEventType, MasterStatus } from "@prisma/client";
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

const updateSchema = z.object({
  fullName: z.string().trim().min(1).max(160).optional(),
  surname: z.string().trim().max(100).nullable().optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  status: z.nativeEnum(MasterStatus).optional(),
  dismissedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional(),
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
  return changes.length ? `Driver updated: ${changes.join("; ")}` : "Driver update requested without changes";
}

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

  app.patch("/api/drivers/:id", async (request, reply) => {
    const user = await requireUser(request, reply, config, "MANAGER");
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const parsed = updateSchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid driver update" });
    }

    const before = await prisma.driver.findFirst({
      where: { id: params.data.id, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        surname: true,
        phone: true,
        status: true,
        dismissedDate: true,
        isActive: true,
      },
    });
    if (!before) {
      return reply.code(404).send({ ok: false, error: "Driver not found" });
    }

    const input = parsed.data;
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.driver.update({
        where: { id: before.id },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.surname !== undefined ? { surname: cleanText(input.surname) } : {}),
          ...(input.phone !== undefined ? { phone: cleanText(input.phone) } : {}),
          ...(input.status !== undefined ? { status: input.status, rawStatus: input.status } : {}),
          ...(input.dismissedDate !== undefined ? { dismissedDate: dateOrNull(input.dismissedDate) } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: {
          id: true,
          fullName: true,
          surname: true,
          phone: true,
          status: true,
          dismissedDate: true,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.STATUS_CHANGED,
          entityType: "Driver",
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
