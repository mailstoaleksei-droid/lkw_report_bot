import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { prisma } from "../prisma.js";
import { verifyPassword } from "../auth/password.js";
import { createSessionToken, verifySessionToken } from "../auth/tokens.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function registerAuthRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.post("/api/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "Invalid email or password" });
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
    });

    if (!user || !user.isActive || user.deletedAt) {
      return reply.code(401).send({ ok: false, error: "Invalid email or password" });
    }

    const passwordOk = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!passwordOk) {
      return reply.code(401).send({ ok: false, error: "Invalid email or password" });
    }

    const token = await createSessionToken({ userId: user.id, role: user.role }, config.jwtSecret);
    reply.setCookie(config.sessionCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.nodeEnv === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie(config.sessionCookieName, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (request, reply) => {
    const token = request.cookies[config.sessionCookieName];
    if (!token) {
      return reply.code(401).send({ ok: false, error: "Not authenticated" });
    }

    const session = await verifySessionToken(token, config.jwtSecret);
    if (!session) {
      return reply.code(401).send({ ok: false, error: "Invalid session" });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      return reply.code(401).send({ ok: false, error: "Invalid session" });
    }

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  });
}

