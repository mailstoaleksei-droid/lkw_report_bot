import { AuditEventType } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import type { AppConfig } from "../config.js";
import { prisma } from "../prisma.js";

const settingKeys = [
  "defaultCountry",
  "defaultPeriod",
  "rundeCount",
  "holidayRegion",
] as const;

type SettingKey = typeof settingKeys[number];

const defaultSettings: Record<SettingKey, string> = {
  defaultCountry: "DE",
  defaultPeriod: "day",
  rundeCount: "3",
  holidayRegion: "HH",
};

const settingsSchema = z.object({
  defaultCountry: z.string().trim().min(2).max(3).default(defaultSettings.defaultCountry),
  defaultPeriod: z.enum(["day", "week", "month"]).default("day"),
  rundeCount: z.string().regex(/^[1-9]$/).default(defaultSettings.rundeCount),
  holidayRegion: z.string().trim().min(2).max(8).default(defaultSettings.holidayRegion),
});

function normalizeSettings(rows: Array<{ key: string; value: unknown }>): Record<SettingKey, string> {
  const current = { ...defaultSettings };
  for (const row of rows) {
    if (!settingKeys.includes(row.key as SettingKey)) continue;
    current[row.key as SettingKey] = String(row.value ?? defaultSettings[row.key as SettingKey]);
  }
  return current;
}

function buildChangeMessage(before: Record<SettingKey, string>, after: Record<SettingKey, string>): string {
  const changes = settingKeys
    .filter((key) => before[key] !== after[key])
    .map((key) => `${key}: ${before[key]} -> ${after[key]}`);
  return changes.length ? `Settings updated: ${changes.join("; ")}` : "Settings update requested without changes";
}

export async function registerSettingsRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get("/api/settings", async (request, reply) => {
    const user = await requireUser(request, reply, config, "MANAGER");
    if (!user) return;

    const rows = await prisma.appSetting.findMany({
      where: { key: { in: [...settingKeys] } },
      select: { key: true, value: true },
    });

    return { ok: true, settings: normalizeSettings(rows) };
  });

  app.patch("/api/settings", async (request, reply) => {
    const user = await requireUser(request, reply, config, "ADMIN");
    if (!user) return;

    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid settings payload" });
    }

    const beforeRows = await prisma.appSetting.findMany({
      where: { key: { in: [...settingKeys] } },
      select: { key: true, value: true },
    });
    const before = normalizeSettings(beforeRows);
    const after = parsed.data;

    await prisma.$transaction(async (tx) => {
      await Promise.all(settingKeys.map((key) => tx.appSetting.upsert({
        where: { key },
        update: { value: after[key] },
        create: { key, value: after[key] },
      })));

      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.STATUS_CHANGED,
          entityType: "AppSetting",
          entityId: "global",
          userId: user.id,
          message: buildChangeMessage(before, after),
          before,
          after,
        },
      });
    });

    return { ok: true, settings: after };
  });
}
