import { OrderStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import type { AppConfig } from "../config.js";
import { getGermanHamburgHolidays } from "../domain/holidays.js";
import { lkwPlanningWhere } from "../domain/planning-availability.js";
import { prisma } from "../prisma.js";

const dayQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function dateRange(dateOnly: string): { start: Date; end: Date } {
  const start = new Date(`${dateOnly}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function registerPlanningRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get("/api/planning/day", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const parsed = dayQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid date query" });
    }

    const { start, end } = dateRange(parsed.data.date);
    const [orders, assignments, totalPlanningLkw] = await Promise.all([
      prisma.order.findMany({
        where: {
          planningDate: { gte: start, lt: end },
          deletedAt: null,
        },
        orderBy: [{ runde: "asc" }, { createdAt: "asc" }],
        include: {
          assignments: {
            where: { deletedAt: null },
            select: { id: true },
          },
        },
      }),
      prisma.assignment.findMany({
        where: {
          planningDate: { gte: start, lt: end },
          deletedAt: null,
        },
        orderBy: [
          { lkw: { number: "asc" } },
          { runde: "asc" },
          { createdAt: "asc" },
        ],
        include: {
          order: true,
          lkw: { include: { company: true } },
          driver: {
            include: {
              company: true,
              availability: {
                where: { date: start },
                select: { status: true, rawStatus: true, source: true },
              },
            },
          },
          chassis: true,
        },
      }),
      prisma.lkw.count({
        where: lkwPlanningWhere(start),
      }),
    ]);

    const assignedLkwIds = new Set(assignments.map((row) => row.lkwId).filter(Boolean));
    const openOrders = orders.filter((order) => order.status === OrderStatus.OPEN).length;
    const problemOrders = orders.filter((order) => order.status === OrderStatus.PROBLEM).length;
    const unassignedOrders = orders.filter((order) => order.assignments.length === 0);

    return {
      ok: true,
      date: parsed.data.date,
      counters: {
        ordersToday: orders.length,
        assignedLkw: assignedLkwIds.size,
        freeLkw: Math.max(totalPlanningLkw - assignedLkwIds.size, 0),
        openOrders,
        problemOrders,
        lkwUsagePercent: totalPlanningLkw > 0
          ? Math.round((assignedLkwIds.size / totalPlanningLkw) * 1000) / 10
          : 0,
      },
      holidays: getGermanHamburgHolidays(parsed.data.date),
      rows: assignments.map((assignment) => ({
        id: assignment.id,
        runde: assignment.runde,
        status: assignment.status,
        problemReason: assignment.problemReason,
        lkw: assignment.lkw ? {
          id: assignment.lkw.id,
          number: assignment.lkw.number,
          status: assignment.lkw.status,
          type: assignment.lkw.type,
          company: assignment.lkw.company?.name || null,
        } : null,
        driver: assignment.driver ? {
          id: assignment.driver.id,
          externalId: assignment.driver.externalId,
          fullName: assignment.driver.fullName,
          status: assignment.driver.status,
          company: assignment.driver.company?.name || null,
          availability: assignment.driver.availability,
        } : null,
        chassis: assignment.chassis ? {
          id: assignment.chassis.id,
          number: assignment.chassis.number,
          status: assignment.chassis.status,
        } : null,
        order: {
          id: assignment.order.id,
          description: assignment.order.description,
          customer: assignment.order.customer,
          plz: assignment.order.plz,
          city: assignment.order.city,
          country: assignment.order.country,
          plannedTime: assignment.order.plannedTime,
          info: assignment.order.info,
          status: assignment.order.status,
          problemReason: assignment.order.problemReason,
        },
      })),
      unassignedOrders: unassignedOrders.map((order) => ({
        id: order.id,
        runde: order.runde,
        description: order.description,
        customer: order.customer,
        plz: order.plz,
        city: order.city,
        country: order.country,
        plannedTime: order.plannedTime,
        info: order.info,
        status: order.status,
        problemReason: order.problemReason,
      })),
    };
  });
}
