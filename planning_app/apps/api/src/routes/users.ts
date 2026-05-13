import { AuditEventType, RoleName } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import { hashPassword } from "../auth/password.js";
import type { AppConfig } from "../config.js";
import { prisma } from "../prisma.js";

const userCreateSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(2),
  password: z.string().min(10),
  role: z.nativeEnum(RoleName).default(RoleName.VIEWER),
});

const userUpdateSchema = z.object({
  displayName: z.string().trim().min(2).optional(),
  role: z.nativeEnum(RoleName).optional(),
  isActive: z.boolean().optional(),
});

const passwordResetSchema = z.object({
  password: z.string().min(10),
});

function publicUser(user: {
  id: string;
  email: string;
  displayName: string;
  role: RoleName;
  mustChangePassword: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function registerUserRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get("/api/users", async (request, reply) => {
    const user = await requireUser(request, reply, config, "ADMIN");
    if (!user) return;

    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        mustChangePassword: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { ok: true, items: users.map(publicUser) };
  });

  app.post("/api/users", async (request, reply) => {
    const user = await requireUser(request, reply, config, "ADMIN");
    if (!user) return;

    const parsed = userCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid user payload" });
    }

    const input = parsed.data;
    const email = input.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) {
      return reply.code(409).send({ ok: false, error: "User already exists" });
    }

    const created = await prisma.$transaction(async (tx) => {
      const saved = await tx.user.create({
        data: {
          email,
          displayName: input.displayName,
          role: input.role,
          passwordHash: await hashPassword(input.password),
          mustChangePassword: true,
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          mustChangePassword: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.USER_CREATED,
          entityType: "User",
          entityId: saved.id,
          userId: user.id,
          message: "User created",
          after: publicUser(saved),
        },
      });

      return saved;
    });

    return { ok: true, user: publicUser(created) };
  });

  app.patch("/api/users/:id", async (request, reply) => {
    const user = await requireUser(request, reply, config, "ADMIN");
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const parsed = userUpdateSchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid user update" });
    }

    const input = parsed.data;
    const before = await prisma.user.findFirst({
      where: { id: params.data.id, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        mustChangePassword: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!before) {
      return reply.code(404).send({ ok: false, error: "User not found" });
    }
    if (params.data.id === user.id && input.role && input.role !== before.role) {
      return reply.code(400).send({ ok: false, error: "Admin cannot change own role" });
    }
    if (params.data.id === user.id && input.isActive === false) {
      return reply.code(400).send({ ok: false, error: "Admin cannot deactivate own account" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: params.data.id },
        data: {
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          mustChangePassword: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          eventType: input.role && input.role !== before.role
            ? AuditEventType.USER_ROLE_CHANGED
            : AuditEventType.STATUS_CHANGED,
          entityType: "User",
          entityId: saved.id,
          userId: user.id,
          message: input.role && input.role !== before.role ? "User role changed" : "User updated",
          before: publicUser(before),
          after: publicUser(saved),
        },
      });

      return saved;
    });

    return { ok: true, user: publicUser(updated) };
  });

  app.post("/api/users/:id/reset-password", async (request, reply) => {
    const user = await requireUser(request, reply, config, "ADMIN");
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const parsed = passwordResetSchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid password reset payload" });
    }

    const before = await prisma.user.findFirst({
      where: { id: params.data.id, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        mustChangePassword: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!before) {
      return reply.code(404).send({ ok: false, error: "User not found" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: params.data.id },
        data: {
          passwordHash: await hashPassword(parsed.data.password),
          mustChangePassword: true,
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          mustChangePassword: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          eventType: AuditEventType.STATUS_CHANGED,
          entityType: "User",
          entityId: saved.id,
          userId: user.id,
          message: "User password reset; temporary password requires change on next login",
          before: publicUser(before),
          after: publicUser(saved),
        },
      });

      return saved;
    });

    return { ok: true, user: publicUser(updated) };
  });
}
