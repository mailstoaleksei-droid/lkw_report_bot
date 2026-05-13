import { AuditEventType, OrderStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import type { AppConfig } from "../config.js";
import { prisma } from "../prisma.js";

const orderCreateSchema = z.object({
  planningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  runde: z.number().int().min(1).max(20),
  description: z.string().trim().min(1),
  customer: z.string().trim().optional().nullable(),
  plz: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  country: z.string().trim().optional().nullable(),
  plannedTime: z.string().trim().optional().nullable(),
  info: z.string().trim().optional().nullable(),
  tourType: z.string().trim().optional().nullable(),
  externalOrderId: z.string().trim().optional().nullable(),
});

const orderUpdateSchema = orderCreateSchema.partial().extend({
  status: z.nativeEnum(OrderStatus).optional(),
});

function toPlanningDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function registerOrderRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.post("/api/orders", async (request, reply) => {
    const user = await requireUser(request, reply, config, "OPERATOR");
    if (!user) return;

    const parsed = orderCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid order payload" });
    }

    const input = parsed.data;
    const order = await prisma.$transaction(async (tx) => {
      const saved = await tx.order.create({
        data: {
          planningDate: toPlanningDate(input.planningDate),
          runde: input.runde,
          description: input.description,
          customer: input.customer || null,
          plz: input.plz || null,
          city: input.city || null,
          country: input.country || null,
          plannedTime: input.plannedTime || null,
          info: input.info || null,
          tourType: input.tourType || null,
          externalOrderId: input.externalOrderId || null,
          createdById: user.id,
          status: OrderStatus.OPEN,
        },
      });
      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.ORDER_CREATED,
          entityType: "Order",
          entityId: saved.id,
          orderId: saved.id,
          userId: user.id,
          message: "Order created",
          after: saved,
        },
      });
      return saved;
    });

    return { ok: true, order };
  });

  app.patch("/api/orders/:id", async (request, reply) => {
    const user = await requireUser(request, reply, config, "OPERATOR");
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const parsed = orderUpdateSchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid order update" });
    }

    const before = await prisma.order.findFirst({
      where: { id: params.data.id, deletedAt: null },
    });
    if (!before) {
      return reply.code(404).send({ ok: false, error: "Order not found" });
    }

    const input = parsed.data;
    const order = await prisma.$transaction(async (tx) => {
      const saved = await tx.order.update({
        where: { id: params.data.id },
        data: {
          ...(input.planningDate ? { planningDate: toPlanningDate(input.planningDate) } : {}),
          ...(input.runde !== undefined ? { runde: input.runde } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.customer !== undefined ? { customer: input.customer || null } : {}),
          ...(input.plz !== undefined ? { plz: input.plz || null } : {}),
          ...(input.city !== undefined ? { city: input.city || null } : {}),
          ...(input.country !== undefined ? { country: input.country || null } : {}),
          ...(input.plannedTime !== undefined ? { plannedTime: input.plannedTime || null } : {}),
          ...(input.info !== undefined ? { info: input.info || null } : {}),
          ...(input.tourType !== undefined ? { tourType: input.tourType || null } : {}),
          ...(input.externalOrderId !== undefined ? { externalOrderId: input.externalOrderId || null } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
      });
      await tx.assignment.updateMany({
        where: { orderId: saved.id, deletedAt: null },
        data: {
          planningDate: saved.planningDate,
          runde: saved.runde,
          ...(input.status ? { status: input.status } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.ORDER_UPDATED,
          entityType: "Order",
          entityId: saved.id,
          orderId: saved.id,
          userId: user.id,
          message: "Order updated",
          before,
          after: saved,
        },
      });
      return saved;
    });

    return { ok: true, order };
  });

  app.delete("/api/orders/:id", async (request, reply) => {
    const user = await requireUser(request, reply, config, "OPERATOR");
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ ok: false, error: "Invalid order id" });
    }

    const before = await prisma.order.findFirst({
      where: { id: params.data.id, deletedAt: null },
    });
    if (!before) {
      return reply.code(404).send({ ok: false, error: "Order not found" });
    }

    const deleted = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const saved = await tx.order.update({
        where: { id: params.data.id },
        data: {
          status: OrderStatus.CANCELLED,
          deletedAt: now,
        },
      });
      await tx.assignment.updateMany({
        where: { orderId: saved.id, deletedAt: null },
        data: {
          status: OrderStatus.CANCELLED,
          deletedAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.ORDER_DELETED,
          entityType: "Order",
          entityId: saved.id,
          orderId: saved.id,
          userId: user.id,
          message: "Order soft-deleted",
          before,
          after: saved,
        },
      });
      return saved;
    });

    return { ok: true, order: deleted };
  });

  app.post("/api/orders/:id/cancel", async (request, reply) => {
    const user = await requireUser(request, reply, config, "OPERATOR");
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ ok: false, error: "Invalid order id" });
    }

    const before = await prisma.order.findFirst({
      where: { id: params.data.id, deletedAt: null },
    });
    if (!before) {
      return reply.code(404).send({ ok: false, error: "Order not found" });
    }

    const order = await prisma.$transaction(async (tx) => {
      const saved = await tx.order.update({
        where: { id: params.data.id },
        data: { status: OrderStatus.CANCELLED },
      });
      await tx.assignment.updateMany({
        where: { orderId: saved.id, deletedAt: null },
        data: { status: OrderStatus.CANCELLED },
      });
      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.ORDER_CANCELLED,
          entityType: "Order",
          entityId: saved.id,
          orderId: saved.id,
          userId: user.id,
          message: "Order cancelled",
          before,
          after: saved,
        },
      });
      return saved;
    });

    return { ok: true, order };
  });
}
