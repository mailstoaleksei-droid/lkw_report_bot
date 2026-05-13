import { MasterStatus, Prisma } from "@prisma/client";

export function toPlanningDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function lkwPlanningWhere(planningDate: Date): Prisma.LkwWhereInput {
  return {
    deletedAt: null,
    OR: [
      {
        isActive: true,
        status: { notIn: [MasterStatus.INACTIVE, MasterStatus.SOLD, MasterStatus.RETURNED] },
      },
      {
        status: MasterStatus.SOLD,
        soldDate: { gt: planningDate },
      },
      {
        status: MasterStatus.RETURNED,
        returnedDate: { gt: planningDate },
      },
    ],
  };
}

export function driverPlanningWhere(planningDate: Date): Prisma.DriverWhereInput {
  return {
    deletedAt: null,
    OR: [
      {
        isActive: true,
        status: { notIn: [MasterStatus.INACTIVE, MasterStatus.DISMISSED] },
      },
      {
        status: MasterStatus.DISMISSED,
        dismissedDate: { gt: planningDate },
      },
    ],
  };
}

export function lkwUnavailableReason(
  lkw: { isActive: boolean; status: MasterStatus; soldDate: Date | null; returnedDate: Date | null },
  planningDate: Date,
): string | null {
  if (lkw.status === MasterStatus.INACTIVE) return "LKW is inactive";
  if (lkw.status === MasterStatus.SOLD) {
    return lkw.soldDate && lkw.soldDate > planningDate ? null : "LKW sold on or before planning date";
  }
  if (lkw.status === MasterStatus.RETURNED) {
    return lkw.returnedDate && lkw.returnedDate > planningDate ? null : "LKW returned on or before planning date";
  }
  if (!lkw.isActive) return "LKW is not active for normal planning";
  return null;
}

export function driverUnavailableReason(
  driver: { isActive: boolean; status: MasterStatus; dismissedDate: Date | null },
  planningDate: Date,
): string | null {
  if (driver.status === MasterStatus.INACTIVE) return "Driver is inactive";
  if (driver.status === MasterStatus.DISMISSED) {
    return driver.dismissedDate && driver.dismissedDate > planningDate ? null : "Driver dismissed on or before planning date";
  }
  if (!driver.isActive) return "Driver is not active";
  return null;
}
