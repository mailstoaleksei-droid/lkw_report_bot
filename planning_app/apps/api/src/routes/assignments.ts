import { AuditEventType, MasterStatus, OrderStatus, Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import type { AppConfig } from "../config.js";
import { prisma } from "../prisma.js";

const assignmentSchema = z.object({
  orderId: z.string().uuid(),
  lkwId: z.string().uuid().nullable().optional(),
  driverId: z.string().uuid().nullable().optional(),
  chassisId: z.string().uuid().nullable().optional(),
});

type ProblemCheck = {
  status: OrderStatus;
  problemReason: string | null;
};

type AssignmentAuditSnapshot = {
  lkw: string;
  driver: string;
  status: string;
  problemReason: string | null;
};

function dateOnly(value: Date): Date {
  return new Date(value.toISOString().slice(0, 10) + "T00:00:00.000Z");
}

async function assignmentAuditSnapshot(
  tx: Prisma.TransactionClient,
  assignment: { lkwId: string | null; driverId: string | null; status: OrderStatus; problemReason: string | null } | null,
): Promise<AssignmentAuditSnapshot> {
  if (!assignment) {
    return { lkw: "-", driver: "-", status: "-", problemReason: null };
  }
  const [lkw, driver] = await Promise.all([
    assignment.lkwId ? tx.lkw.findUnique({ where: { id: assignment.lkwId }, select: { number: true } }) : null,
    assignment.driverId ? tx.driver.findUnique({ where: { id: assignment.driverId }, select: { fullName: true } }) : null,
  ]);
  return {
    lkw: lkw?.number || "-",
    driver: driver?.fullName || "-",
    status: assignment.status,
    problemReason: assignment.problemReason,
  };
}

function summarizeAssignmentChanges(before: AssignmentAuditSnapshot, after: AssignmentAuditSnapshot): string {
  const changes = [
    before.lkw !== after.lkw ? `LKW: ${before.lkw} -> ${after.lkw}` : null,
    before.driver !== after.driver ? `driver: ${before.driver} -> ${after.driver}` : null,
    before.status !== after.status ? `status: ${before.status} -> ${after.status}` : null,
    (before.problemReason || "-") !== (after.problemReason || "-")
      ? `problem: ${before.problemReason || "-"} -> ${after.problemReason || "-"}`
      : null,
  ].filter(Boolean);
  return changes.length > 0 ? `Assignment updated: ${changes.join("; ")}` : "Assignment updated";
}

async function checkAssignmentProblems(
  tx: Prisma.TransactionClient,
  input: { orderId: string; lkwId: string | null; driverId: string | null },
): Promise<ProblemCheck> {
  const order = await tx.order.findUnique({ where: { id: input.orderId } });
  if (!order) return { status: OrderStatus.PROBLEM, problemReason: "Order not found" };

  const reasons: string[] = [];
  if (input.lkwId) {
    const lkw = await tx.lkw.findUnique({ where: { id: input.lkwId } });
    if (!lkw || lkw.deletedAt) {
      reasons.push("LKW not found");
    } else {
      if (
        !lkw.isActive ||
        lkw.status === MasterStatus.INACTIVE ||
        lkw.status === MasterStatus.SOLD ||
        lkw.status === MasterStatus.RETURNED
      ) {
        reasons.push("LKW is not active for normal planning");
      }
      if (lkw.soldDate && lkw.soldDate <= order.planningDate) {
        reasons.push("LKW sold on or before planning date");
      }
      if (lkw.returnedDate && lkw.returnedDate <= order.planningDate) {
        reasons.push("LKW returned on or before planning date");
      }
      const sameRunde = await tx.assignment.findFirst({
        where: {
          orderId: { not: input.orderId },
          lkwId: input.lkwId,
          planningDate: order.planningDate,
          runde: order.runde,
          deletedAt: null,
          status: { not: OrderStatus.CANCELLED },
        },
        select: { id: true },
      });
      if (sameRunde) {
        reasons.push("LKW already assigned in the same Runde");
      }
    }
  }

  if (input.driverId) {
    const driver = await tx.driver.findUnique({ where: { id: input.driverId } });
    if (!driver || driver.deletedAt) {
      reasons.push("Driver not found");
    } else {
      if (!driver.isActive || driver.status === MasterStatus.DISMISSED) {
        reasons.push("Driver is not active");
      }
      if (driver.dismissedDate && driver.dismissedDate <= order.planningDate) {
        reasons.push("Driver dismissed on or before planning date");
      }
      const availability = await tx.driverAvailability.findFirst({
        where: {
          driverId: input.driverId,
          date: dateOnly(order.planningDate),
          status: { in: [MasterStatus.VACATION, MasterStatus.SICK] },
        },
        select: { status: true },
      });
      if (availability) {
        reasons.push(`Driver unavailable: ${availability.status}`);
      }
    }
  }

  return {
    status: reasons.length > 0 ? OrderStatus.PROBLEM : OrderStatus.PLANNED,
    problemReason: reasons.length > 0 ? reasons.join("; ") : null,
  };
}

export async function registerAssignmentRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.post("/api/assignments/upsert", async (request, reply) => {
    const user = await requireUser(request, reply, config, "OPERATOR");
    if (!user) return;

    const parsed = assignmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid assignment payload" });
    }

    const input = {
      orderId: parsed.data.orderId,
      lkwId: parsed.data.lkwId || null,
      driverId: parsed.data.driverId || null,
      chassisId: parsed.data.chassisId || null,
    };

    const order = await prisma.order.findFirst({
      where: { id: input.orderId, deletedAt: null },
    });
    if (!order) {
      return reply.code(404).send({ ok: false, error: "Order not found" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.assignment.findFirst({
        where: { orderId: input.orderId, deletedAt: null },
      });
      const beforeSnapshot = await assignmentAuditSnapshot(tx, before);
      const check = await checkAssignmentProblems(tx, input);

      const assignment = before
        ? await tx.assignment.update({
          where: { id: before.id },
          data: {
            lkwId: input.lkwId,
            driverId: input.driverId,
            chassisId: input.chassisId,
            planningDate: order.planningDate,
            runde: order.runde,
            status: check.status,
            problemReason: check.problemReason,
          },
        })
        : await tx.assignment.create({
          data: {
            orderId: input.orderId,
            lkwId: input.lkwId,
            driverId: input.driverId,
            chassisId: input.chassisId,
            planningDate: order.planningDate,
            runde: order.runde,
            status: check.status,
            problemReason: check.problemReason,
          },
        });
      const afterSnapshot = await assignmentAuditSnapshot(tx, assignment);

      const updatedOrder = await tx.order.update({
        where: { id: input.orderId },
        data: {
          status: check.status,
          problemReason: check.problemReason,
        },
      });

      await tx.auditLog.create({
        data: {
          eventType: before ? AuditEventType.ASSIGNMENT_UPDATED : AuditEventType.LKW_ASSIGNED,
          entityType: "Assignment",
          entityId: assignment.id,
          orderId: input.orderId,
          assignmentId: assignment.id,
          userId: user.id,
          message: before ? summarizeAssignmentChanges(beforeSnapshot, afterSnapshot) : `Assignment created: LKW ${afterSnapshot.lkw}; driver ${afterSnapshot.driver}`,
          before: before || undefined,
          after: assignment,
        },
      });

      if (input.driverId) {
        await tx.auditLog.create({
          data: {
            eventType: AuditEventType.DRIVER_ASSIGNED,
            entityType: "Assignment",
            entityId: assignment.id,
            orderId: input.orderId,
            assignmentId: assignment.id,
            userId: user.id,
            message: `Driver assigned: ${afterSnapshot.driver}`,
            after: assignment,
          },
        });
      }

      return { assignment, order: updatedOrder };
    });

    return { ok: true, ...result };
  });
}
