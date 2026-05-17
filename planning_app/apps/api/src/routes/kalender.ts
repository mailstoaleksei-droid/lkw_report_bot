import { MasterStatus } from "@prisma/client";
import ExcelJS from "exceljs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import type { AppConfig } from "../config.js";
import { prisma } from "../prisma.js";

const SOURCE_WEB = "kalender-web";

function druckerFromPayload(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const p = rawPayload as Record<string, unknown>;
  const val = p["Drucker"] ?? p["drucker"] ?? p["tachograph"] ?? p["Tachograph"];
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s || null;
}

const weekQuerySchema = z.object({
  isoWeek: z.string().regex(/^\d{6}$/),
});

const availDriversSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lkwId: z.string().uuid().optional(),
});

const assignBodySchema = z.object({
  lkwId: z.string().uuid(),
  driverId: z.string().uuid().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const unassignQuerySchema = z.object({
  lkwId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function isoWeekToRange(year: number, week: number): { start: Date; end: Date; days: string[] } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const start = new Date(week1Mon);
  start.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }

  return { start, end, days };
}

type CellLabel = "assigned" | "vacation" | "sick" | "workshop" | "sold" | "returned" | "reserve" | "no-driver" | "inactive";

const CELL_COLORS: Record<CellLabel, string> = {
  assigned: "#DCFCE7",
  vacation: "#FEF08A",
  sick: "#FCA5A5",
  workshop: "#FED7AA",
  sold: "#374151",
  returned: "#D1D5DB",
  reserve: "#DDD6FE",
  "no-driver": "#FECDD3",
  inactive: "#9CA3AF",
};

function computeCell(
  lkw: { status: MasterStatus; soldDate: Date | null; returnedDate: Date | null },
  dayDate: Date,
  assignedDriverName: string | null,
  driverAvailStatus: MasterStatus | null,
  isWebAssigned: boolean,
): { label: CellLabel; driverName: string | null } {
  if (lkw.status === MasterStatus.SOLD && lkw.soldDate) {
    const soldDay = new Date(lkw.soldDate.toISOString().slice(0, 10) + "T00:00:00.000Z");
    if (soldDay <= dayDate) return { label: "sold", driverName: null };
  }
  if (lkw.status === MasterStatus.RETURNED && lkw.returnedDate) {
    const retDay = new Date(lkw.returnedDate.toISOString().slice(0, 10) + "T00:00:00.000Z");
    if (retDay <= dayDate) return { label: "returned", driverName: null };
  }
  if (lkw.status === MasterStatus.INACTIVE) return { label: "inactive", driverName: null };
  if (lkw.status === MasterStatus.WORKSHOP) return { label: "workshop", driverName: null };
  if (lkw.status === MasterStatus.RESERVE) return { label: "reserve", driverName: assignedDriverName };
  if (driverAvailStatus === MasterStatus.VACATION) return { label: "vacation", driverName: assignedDriverName };
  if (driverAvailStatus === MasterStatus.SICK) return { label: "sick", driverName: assignedDriverName };
  if (assignedDriverName) return { label: "assigned", driverName: assignedDriverName };
  return { label: "no-driver", driverName: null };
}

export async function registerKalenderRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {

  // ── GET /api/kalender/week ──────────────────────────────────────────────────
  app.get("/api/kalender/week", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const parsed = weekQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid isoWeek. Format: YYYYWW (e.g. 202621)" });
    }

    const raw = parsed.data.isoWeek;
    const year = parseInt(raw.slice(0, 4), 10);
    const week = parseInt(raw.slice(4, 6), 10);

    if (week < 1 || week > 53) {
      return reply.code(400).send({ ok: false, error: "Week must be 01–53" });
    }

    const { start, end, days } = isoWeekToRange(year, week);

    const [lkws, assignments, webPairings, allActiveDrivers] = await Promise.all([
      prisma.lkw.findMany({
        where: {
          deletedAt: null,
          NOT: { status: MasterStatus.INACTIVE },
          OR: [
            { isActive: true },
            { status: MasterStatus.SOLD, soldDate: { gte: start } },
            { status: MasterStatus.RETURNED, returnedDate: { gte: start } },
            { status: MasterStatus.WORKSHOP },
            { status: MasterStatus.RESERVE },
          ],
        },
        orderBy: [{ number: "asc" }],
        select: {
          id: true, number: true, status: true,
          soldDate: true, returnedDate: true,
          rawPayload: true,
          company: { select: { name: true } },
        },
      }),
      prisma.assignment.findMany({
        where: { planningDate: { gte: start, lt: end }, deletedAt: null, lkwId: { not: null } },
        select: {
          id: true, lkwId: true, driverId: true, planningDate: true,
          driver: { select: { id: true, fullName: true } },
        },
      }),
      // Manual web assignments via LkwDriverPairing
      prisma.lkwDriverPairing.findMany({
        where: { source: SOURCE_WEB, validFrom: { gte: start, lt: end } },
        select: {
          id: true, lkwId: true, driverId: true, validFrom: true,
          driver: { select: { id: true, fullName: true } },
        },
      }),
      prisma.driver.findMany({
        where: {
          deletedAt: null, isActive: true,
          status: { notIn: [MasterStatus.INACTIVE, MasterStatus.DISMISSED] },
        },
        select: { id: true, fullName: true },
        orderBy: [{ fullName: "asc" }],
      }),
    ]);

    // assignment map: "lkwId::YYYY-MM-DD" → entry (ETL data takes precedence)
    type CellEntry = { driverId: string | null; driverName: string | null; isWebAssigned: boolean };
    const cellMap = new Map<string, CellEntry>();

    // First: web pairings (lower priority)
    for (const p of webPairings) {
      const dateKey = p.validFrom.toISOString().slice(0, 10);
      cellMap.set(`${p.lkwId}::${dateKey}`, {
        driverId: p.driverId,
        driverName: p.driver?.fullName ?? null,
        isWebAssigned: true,
      });
    }

    // Then: ETL assignments (override pairings)
    for (const a of assignments) {
      if (!a.lkwId) continue;
      const dateKey = a.planningDate.toISOString().slice(0, 10);
      cellMap.set(`${a.lkwId}::${dateKey}`, {
        driverId: a.driverId,
        driverName: a.driver?.fullName ?? null,
        isWebAssigned: false,
      });
    }

    // Fetch availability for all active drivers
    const allDriverIds = allActiveDrivers.map((d) => d.id);
    const availabilities = allDriverIds.length > 0
      ? await prisma.driverAvailability.findMany({
          where: { driverId: { in: allDriverIds }, date: { gte: start, lt: end } },
          select: { driverId: true, date: true, status: true },
        })
      : [];

    const availMap = new Map<string, MasterStatus>();
    for (const av of availabilities) {
      availMap.set(`${av.driverId}::${av.date.toISOString().slice(0, 10)}`, av.status);
    }

    // Build grid
    const lkwRows = lkws.map((lkw) => {
      const cells = days.map((day) => {
        const dayDate = new Date(`${day}T00:00:00.000Z`);
        const entry = cellMap.get(`${lkw.id}::${day}`);
        const driverAvailStatus = entry?.driverId
          ? (availMap.get(`${entry.driverId}::${day}`) ?? null)
          : null;
        const { label, driverName } = computeCell(
          lkw, dayDate, entry?.driverName ?? null, driverAvailStatus, entry?.isWebAssigned ?? false,
        );
        return {
          date: day,
          driverId: entry?.driverId ?? null,
          driverName,
          isWebAssigned: entry?.isWebAssigned ?? false,
          label,
          color: CELL_COLORS[label],
        };
      });
      return {
        lkwId: lkw.id,
        lkwNumber: lkw.number,
        company: lkw.company?.name ?? null,
        status: lkw.status,
        drucker: druckerFromPayload(lkw.rawPayload),
        cells,
      };
    });

    // Per-day stats
    const dayStats = days.map((day) => {
      let totalActive = 0;
      let assigned = 0;
      for (const row of lkwRows) {
        const cell = row.cells.find((c) => c.date === day)!;
        if (cell.label === "sold" || cell.label === "returned" || cell.label === "inactive") continue;
        totalActive++;
        if (cell.driverName) assigned++;
      }
      return {
        date: day,
        assignedLkw: assigned,
        totalActiveLkw: totalActive,
        utilizationPercent: totalActive > 0 ? Math.round((assigned / totalActive) * 1000) / 10 : 0,
      };
    });

    // Week-level stats
    let lkwSold = 0, lkwReturned = 0, lkwWorkshop = 0, lkwReserve = 0, lkwNoDriver = 0, lkwAssigned = 0;
    for (const row of lkwRows) {
      if (row.status === MasterStatus.SOLD) { lkwSold++; continue; }
      if (row.status === MasterStatus.RETURNED) { lkwReturned++; continue; }
      if (row.status === MasterStatus.WORKSHOP) { lkwWorkshop++; continue; }
      if (row.status === MasterStatus.RESERVE) { lkwReserve++; continue; }
      const hasDriver = row.cells.slice(0, 5).some((c) => c.driverName !== null);
      if (hasDriver) lkwAssigned++; else lkwNoDriver++;
    }

    const avgUtilization = dayStats.length > 0
      ? Math.round(dayStats.slice(0, 5).reduce((acc, d) => acc + d.utilizationPercent, 0) / 5 * 10) / 10
      : 0;

    const assignedDriverIds = new Set(
      [...assignments.map((a) => a.driverId), ...webPairings.map((p) => p.driverId)].filter(Boolean) as string[],
    );

    const vacationDriverIds = new Set<string>();
    const sickDriverIds = new Set<string>();
    for (const av of availabilities) {
      if (av.status === MasterStatus.VACATION) vacationDriverIds.add(av.driverId);
      if (av.status === MasterStatus.SICK) sickDriverIds.add(av.driverId);
    }

    const freeDrivers = allActiveDrivers.filter(
      (d) => !assignedDriverIds.has(d.id) && !vacationDriverIds.has(d.id) && !sickDriverIds.has(d.id),
    );

    return {
      ok: true,
      isoWeek: raw,
      year,
      week,
      days,
      lkwRows,
      stats: {
        dayStats,
        weekStats: {
          lkw: {
            total: lkws.length,
            assigned: lkwAssigned,
            noDriver: lkwNoDriver,
            workshop: lkwWorkshop,
            reserve: lkwReserve,
            sold: lkwSold,
            returned: lkwReturned,
            avgUtilizationPercent: avgUtilization,
          },
          drivers: {
            totalActive: allActiveDrivers.length,
            working: assignedDriverIds.size,
            vacation: vacationDriverIds.size,
            sick: sickDriverIds.size,
            free: freeDrivers.length,
            vacationList: allActiveDrivers.filter((d) => vacationDriverIds.has(d.id)),
            sickList: allActiveDrivers.filter((d) => sickDriverIds.has(d.id)),
            freeList: freeDrivers,
          },
        },
      },
    };
  });

  // ── GET /api/kalender/available-drivers ─────────────────────────────────────
  app.get("/api/kalender/available-drivers", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const parsed = availDriversSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "date (YYYY-MM-DD) required" });
    }

    const { date, lkwId } = parsed.data;
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T00:00:00.000Z`);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    // Drivers already assigned (to OTHER LKWs) on this day
    const [assignedOnDay, pairedOnDay, vacationSick, allDrivers] = await Promise.all([
      prisma.assignment.findMany({
        where: {
          planningDate: { gte: dayStart, lt: dayEnd },
          deletedAt: null,
          driverId: { not: null },
          ...(lkwId ? { lkwId: { not: lkwId } } : {}),
        },
        select: { driverId: true },
      }),
      prisma.lkwDriverPairing.findMany({
        where: {
          source: SOURCE_WEB,
          validFrom: { gte: dayStart, lt: dayEnd },
          ...(lkwId ? { lkwId: { not: lkwId } } : {}),
        },
        select: { driverId: true },
      }),
      prisma.driverAvailability.findMany({
        where: {
          date: { gte: dayStart, lt: dayEnd },
          status: { in: [MasterStatus.VACATION, MasterStatus.SICK] },
        },
        select: { driverId: true, status: true },
      }),
      prisma.driver.findMany({
        where: {
          deletedAt: null, isActive: true,
          status: { notIn: [MasterStatus.INACTIVE, MasterStatus.DISMISSED] },
        },
        select: { id: true, fullName: true },
        orderBy: [{ fullName: "asc" }],
      }),
    ]);

    const blockedIds = new Set<string>();
    assignedOnDay.forEach((a) => { if (a.driverId) blockedIds.add(a.driverId); });
    pairedOnDay.forEach((p) => { blockedIds.add(p.driverId); });

    const unavailableMap = new Map<string, MasterStatus>();
    vacationSick.forEach((av) => { unavailableMap.set(av.driverId, av.status); });

    const available = allDrivers.map((d) => ({
      id: d.id,
      fullName: d.fullName,
      blocked: blockedIds.has(d.id),
      unavailableStatus: unavailableMap.get(d.id) ?? null,
    }));

    return { ok: true, date, drivers: available };
  });

  // ── POST /api/kalender/assign ────────────────────────────────────────────────
  app.post("/api/kalender/assign", async (request, reply) => {
    const user = await requireUser(request, reply, config, "OPERATOR");
    if (!user) return;

    const parsed = assignBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid body: lkwId, driverId (or null), date required" });
    }

    const { lkwId, driverId, date } = parsed.data;
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T00:00:00.000Z`);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    // Validate LKW exists
    const lkw = await prisma.lkw.findUnique({ where: { id: lkwId }, select: { id: true, number: true } });
    if (!lkw) return reply.code(404).send({ ok: false, error: "LKW not found" });

    // Validate driver if provided
    if (driverId) {
      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
        select: { id: true, fullName: true, isActive: true },
      });
      if (!driver || !driver.isActive) {
        return reply.code(400).send({ ok: false, error: "Driver not found or inactive" });
      }

      // Check availability
      const avail = await prisma.driverAvailability.findFirst({
        where: {
          driverId,
          date: { gte: dayStart, lt: dayEnd },
          status: { in: [MasterStatus.VACATION, MasterStatus.SICK] },
        },
      });
      if (avail) {
        return reply.code(409).send({
          ok: false,
          error: `Driver is ${avail.status === MasterStatus.VACATION ? "on vacation" : "sick"} on ${date}`,
        });
      }
    }

    // Delete any existing web pairing for this LKW on this day
    await prisma.lkwDriverPairing.deleteMany({
      where: { lkwId, source: SOURCE_WEB, validFrom: { gte: dayStart, lt: dayEnd } },
    });

    if (!driverId) {
      return { ok: true, action: "cleared", lkwId, date };
    }

    // Create new pairing
    const pairing = await prisma.lkwDriverPairing.create({
      data: {
        lkwId,
        driverId,
        validFrom: dayStart,
        validTo: dayEnd,
        source: SOURCE_WEB,
        confidence: 100,
      },
      select: { id: true, lkwId: true, driverId: true, validFrom: true },
    });

    return { ok: true, action: "assigned", pairing };
  });

  // ── DELETE /api/kalender/assign ──────────────────────────────────────────────
  app.delete("/api/kalender/assign", async (request, reply) => {
    const user = await requireUser(request, reply, config, "OPERATOR");
    if (!user) return;

    const parsed = unassignQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "lkwId and date (YYYY-MM-DD) required" });
    }

    const { lkwId, date } = parsed.data;
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T00:00:00.000Z`);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const { count } = await prisma.lkwDriverPairing.deleteMany({
      where: { lkwId, source: SOURCE_WEB, validFrom: { gte: dayStart, lt: dayEnd } },
    });

    return { ok: true, deleted: count };
  });

  // ── GET /api/kalender/multi ──────────────────────────────────────────────────
  // Returns aggregated week cells for N consecutive ISO weeks
  app.get("/api/kalender/multi", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const parsed = z.object({
      startIsoWeek: z.string().regex(/^\d{6}$/),
      weeks: z.coerce.number().int().min(1).max(26).default(8),
    }).safeParse(request.query);

    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "startIsoWeek (YYYYWW) required" });
    }

    const { startIsoWeek, weeks: weekCount } = parsed.data;
    const startYear = parseInt(startIsoWeek.slice(0, 4), 10);
    const startWeek = parseInt(startIsoWeek.slice(4, 6), 10);

    // Build list of ISO weeks and date ranges
    type WeekRange = { isoWeek: string; start: Date; end: Date; days: string[] };
    const weekRanges: WeekRange[] = [];
    let yr = startYear;
    let wk = startWeek;
    for (let i = 0; i < weekCount; i++) {
      const r = isoWeekToRange(yr, wk);
      weekRanges.push({ isoWeek: `${yr}${String(wk).padStart(2, "0")}`, ...r });
      // advance one week
      const nextMon = new Date(r.start);
      nextMon.setUTCDate(r.start.getUTCDate() + 7);
      yr = nextMon.getUTCFullYear();
      const jan4 = new Date(Date.UTC(yr, 0, 4));
      const jan4Day = jan4.getUTCDay() || 7;
      const week1Mon = new Date(jan4);
      week1Mon.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
      const diffDays = Math.round((nextMon.getTime() - week1Mon.getTime()) / 86400000);
      wk = Math.floor(diffDays / 7) + 1;
    }

    const rangeStart = weekRanges[0].start;
    const rangeEnd = weekRanges[weekRanges.length - 1].end;

    // Single DB pass for the whole range
    const [lkws, assignments, webPairings, allAvailabilities] = await Promise.all([
      prisma.lkw.findMany({
        where: {
          deletedAt: null,
          NOT: { status: MasterStatus.INACTIVE },
          OR: [
            { isActive: true },
            { status: MasterStatus.SOLD, soldDate: { gte: rangeStart } },
            { status: MasterStatus.RETURNED, returnedDate: { gte: rangeStart } },
            { status: MasterStatus.WORKSHOP },
            { status: MasterStatus.RESERVE },
          ],
        },
        orderBy: [{ number: "asc" }],
        select: {
          id: true, number: true, status: true,
          soldDate: true, returnedDate: true,
          rawPayload: true,
          company: { select: { name: true } },
        },
      }),
      prisma.assignment.findMany({
        where: { planningDate: { gte: rangeStart, lt: rangeEnd }, deletedAt: null, lkwId: { not: null } },
        select: { lkwId: true, driverId: true, planningDate: true, driver: { select: { id: true, fullName: true } } },
      }),
      prisma.lkwDriverPairing.findMany({
        where: { source: SOURCE_WEB, validFrom: { gte: rangeStart, lt: rangeEnd } },
        select: { lkwId: true, driverId: true, validFrom: true, driver: { select: { id: true, fullName: true } } },
      }),
      prisma.driverAvailability.findMany({
        where: { date: { gte: rangeStart, lt: rangeEnd } },
        select: { driverId: true, date: true, status: true },
      }),
    ]);

    // Build lookup maps
    // "lkwId::YYYY-MM-DD" → { driverId, driverName }
    type DayEntry = { driverId: string | null; driverName: string | null };
    const dayMap = new Map<string, DayEntry>();
    for (const p of webPairings) {
      const dk = p.validFrom.toISOString().slice(0, 10);
      dayMap.set(`${p.lkwId}::${dk}`, { driverId: p.driverId, driverName: p.driver?.fullName ?? null });
    }
    for (const a of assignments) {
      if (!a.lkwId) continue;
      const dk = a.planningDate.toISOString().slice(0, 10);
      dayMap.set(`${a.lkwId}::${dk}`, { driverId: a.driverId, driverName: a.driver?.fullName ?? null });
    }

    // "driverId::YYYY-MM-DD" → MasterStatus
    const availMap = new Map<string, MasterStatus>();
    for (const av of allAvailabilities) {
      availMap.set(`${av.driverId}::${av.date.toISOString().slice(0, 10)}`, av.status);
    }

    function shortName(fullName: string): string {
      const parts = fullName.trim().split(/\s+/);
      if (parts.length === 1) return fullName.slice(0, 12);
      // Return last word (usually surname) capitalized first letter only
      const surname = parts[parts.length - 1];
      return surname.length > 12 ? surname.slice(0, 12) : surname;
    }

    // Build aggregated week cells for each LKW
    const lkwRows = lkws.map((lkw) => {
      const weekCells = weekRanges.map(({ isoWeek, start, days }) => {
        // Check LKW status at start of week
        if (lkw.status === MasterStatus.SOLD && lkw.soldDate) {
          const soldDay = new Date(lkw.soldDate.toISOString().slice(0, 10) + "T00:00:00.000Z");
          if (soldDay <= start) return { isoWeek, label: "sold" as CellLabel, color: CELL_COLORS.sold, driverSummary: null, note: null };
        }
        if (lkw.status === MasterStatus.RETURNED && lkw.returnedDate) {
          const retDay = new Date(lkw.returnedDate.toISOString().slice(0, 10) + "T00:00:00.000Z");
          if (retDay <= start) return { isoWeek, label: "returned" as CellLabel, color: CELL_COLORS.returned, driverSummary: null, note: null };
        }
        if (lkw.status === MasterStatus.WORKSHOP) {
          return { isoWeek, label: "workshop" as CellLabel, color: CELL_COLORS.workshop, driverSummary: null, note: null };
        }

        // Collect Mon-Fri driver entries
        const workDays = days.slice(0, 5);
        const driverEntries = workDays.map((day) => dayMap.get(`${lkw.id}::${day}`) ?? null);
        const driverIds = [...new Set(driverEntries.map((e) => e?.driverId).filter(Boolean) as string[])];
        const driverNames = [...new Set(driverEntries.map((e) => e?.driverName).filter(Boolean) as string[])];

        if (driverIds.length === 0) {
          const label: CellLabel = lkw.status === MasterStatus.RESERVE ? "reserve" : "no-driver";
          return { isoWeek, label, color: CELL_COLORS[label], driverSummary: null, note: null };
        }

        // Check Friday (index 4) driver vacation
        let note: string | null = null;
        const fridayEntry = driverEntries[4];
        if (fridayEntry?.driverId) {
          const fridayAvail = availMap.get(`${fridayEntry.driverId}::${workDays[4]}`);
          if (fridayAvail === MasterStatus.VACATION) note = "→U";
        }
        // Check if multiple drivers (transfer)
        if (driverIds.length > 1) note = (note ? `${note} ` : "") + "↔";

        const driverSummary = driverNames.length === 1
          ? shortName(driverNames[0])
          : driverNames.length === 2
            ? `${shortName(driverNames[0])} / ${shortName(driverNames[1])}`
            : `${shortName(driverNames[0])} …`;

        // Check if any driver has vacation/sick this week → color accordingly
        let label: CellLabel = "assigned";
        const allVacation = driverEntries.every((e) =>
          !e?.driverId || availMap.get(`${e.driverId}::${workDays[driverEntries.indexOf(e)]}`) === MasterStatus.VACATION,
        );
        const anyVacation = driverEntries.some((e) =>
          e?.driverId && availMap.get(`${e.driverId}::${workDays[driverEntries.indexOf(e)]}`) === MasterStatus.VACATION,
        );
        const anySick = driverEntries.some((e) =>
          e?.driverId && availMap.get(`${e.driverId}::${workDays[driverEntries.indexOf(e)]}`) === MasterStatus.SICK,
        );
        if (anySick) label = "sick";
        else if (allVacation) label = "vacation";

        return { isoWeek, label, color: CELL_COLORS[label], driverSummary, note };
      });

      return {
        lkwId: lkw.id,
        lkwNumber: lkw.number,
        company: lkw.company?.name ?? null,
        status: lkw.status,
        drucker: druckerFromPayload(lkw.rawPayload),
        weekCells,
      };
    });

    return {
      ok: true,
      startIsoWeek,
      weeks: weekRanges.map((r) => ({
        isoWeek: r.isoWeek,
        startDate: r.days[0],
        endDate: r.days[4],
      })),
      lkwRows,
    };
  });

  // ── GET /api/kalender/export ──────────────────────────────────────────────────
  // Returns week schedule as xlsx file
  app.get("/api/kalender/export", async (request, reply) => {
    const user = await requireUser(request, reply, config, "VIEWER");
    if (!user) return;

    const parsed = weekQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "isoWeek (YYYYWW) required" });
    }

    const raw = parsed.data.isoWeek;
    const year = parseInt(raw.slice(0, 4), 10);
    const week = parseInt(raw.slice(4, 6), 10);
    if (week < 1 || week > 53) {
      return reply.code(400).send({ ok: false, error: "Week must be 01–53" });
    }

    const { start, end, days } = isoWeekToRange(year, week);

    const [lkws, assignments, webPairings] = await Promise.all([
      prisma.lkw.findMany({
        where: {
          deletedAt: null,
          NOT: { status: MasterStatus.INACTIVE },
          OR: [
            { isActive: true },
            { status: MasterStatus.SOLD, soldDate: { gte: start } },
            { status: MasterStatus.RETURNED, returnedDate: { gte: start } },
            { status: MasterStatus.WORKSHOP },
            { status: MasterStatus.RESERVE },
          ],
        },
        orderBy: [{ number: "asc" }],
        select: {
          id: true, number: true, status: true,
          soldDate: true, returnedDate: true,
          rawPayload: true,
          company: { select: { name: true } },
        },
      }),
      prisma.assignment.findMany({
        where: { planningDate: { gte: start, lt: end }, deletedAt: null, lkwId: { not: null } },
        select: { lkwId: true, driverId: true, planningDate: true, driver: { select: { fullName: true } } },
      }),
      prisma.lkwDriverPairing.findMany({
        where: { source: SOURCE_WEB, validFrom: { gte: start, lt: end } },
        select: { lkwId: true, driverId: true, validFrom: true, driver: { select: { fullName: true } } },
      }),
    ]);

    // Build cell map (same logic as week endpoint)
    type ExportCell = { driverName: string | null; isWebAssigned: boolean };
    const cellMap = new Map<string, ExportCell>();
    for (const p of webPairings) {
      const dateKey = p.validFrom.toISOString().slice(0, 10);
      cellMap.set(`${p.lkwId}::${dateKey}`, { driverName: p.driver?.fullName ?? null, isWebAssigned: true });
    }
    for (const a of assignments) {
      if (!a.lkwId) continue;
      const dateKey = a.planningDate.toISOString().slice(0, 10);
      cellMap.set(`${a.lkwId}::${dateKey}`, { driverName: a.driver?.fullName ?? null, isWebAssigned: false });
    }

    // Build Excel
    const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    const wb = new ExcelJS.Workbook();
    wb.creator = "GROO Fleet Portal";
    const ws = wb.addWorksheet(`KW ${String(week).padStart(2, "0")} ${year}`);

    const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1864AB" } };
    const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    const BORDER: Partial<ExcelJS.Borders> = {
      top: { style: "thin", color: { argb: "FFD8DEE8" } },
      left: { style: "thin", color: { argb: "FFD8DEE8" } },
      bottom: { style: "thin", color: { argb: "FFD8DEE8" } },
      right: { style: "thin", color: { argb: "FFD8DEE8" } },
    };

    // Color map (ARGB — no #)
    const CELL_ARGB: Record<CellLabel, string> = {
      assigned: "FFDCFCE7",
      vacation: "FFFEF08A",
      sick: "FFFCA5A5",
      workshop: "FFFED7AA",
      sold: "FF374151",
      returned: "FFD1D5DB",
      reserve: "FFDDD6FE",
      "no-driver": "FFFECDD3",
      inactive: "FF9CA3AF",
    };

    // Header row
    const headerRow = ws.addRow(["LKW", ...DAY_NAMES.map((d, i) => `${d} ${days[i].slice(5).replace("-", ".")}`)]);
    headerRow.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = BORDER;
    });
    ws.getRow(1).height = 22;

    // Set column widths
    ws.getColumn(1).width = 12;
    for (let i = 2; i <= 8; i++) ws.getColumn(i).width = 20;

    // Data rows
    for (const lkw of lkws) {
      const rowValues: (string | null)[] = [lkw.number];
      const rowColors: string[] = ["FFFFFFFF"];

      for (const day of days) {
        const dayDate = new Date(`${day}T00:00:00.000Z`);
        const entry = cellMap.get(`${lkw.id}::${day}`);
        const { label, driverName } = computeCell(
          lkw, dayDate, entry?.driverName ?? null, null, entry?.isWebAssigned ?? false,
        );
        rowValues.push(driverName ?? (label !== "assigned" ? label.toUpperCase() : ""));
        rowColors.push(CELL_ARGB[label]);
      }

      const row = ws.addRow(rowValues);
      row.height = 18;
      row.eachCell((cell, colNum) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowColors[colNum - 1] } };
        cell.font = {
          bold: colNum === 1,
          color: { argb: rowColors[colNum - 1] === CELL_ARGB.sold ? "FFF3F4F6" : "FF111827" },
          size: 10,
        };
        cell.alignment = { horizontal: colNum === 1 ? "left" : "center", vertical: "middle" };
        cell.border = BORDER;
      });
    }

    // Freeze top row
    ws.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];

    const buffer = await wb.xlsx.writeBuffer();
    const filename = `Kalender_KW${String(week).padStart(2, "0")}_${year}.xlsx`;

    void reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(Buffer.from(buffer));
  });
}
