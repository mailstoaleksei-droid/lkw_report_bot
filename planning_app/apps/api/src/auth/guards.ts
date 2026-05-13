import type { RoleName, User } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { prisma } from "../prisma.js";
import { verifySessionToken } from "./tokens.js";

export type AuthenticatedUser = Pick<User, "id" | "email" | "displayName" | "role">;

const roleRank: Record<RoleName, number> = {
  VIEWER: 1,
  OPERATOR: 2,
  MANAGER: 3,
  ADMIN: 4,
};

export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
  minimumRole: RoleName = "VIEWER",
): Promise<AuthenticatedUser | null> {
  const token = request.cookies[config.sessionCookieName];
  if (!token) {
    reply.code(401).send({ ok: false, error: "Not authenticated" });
    return null;
  }

  const session = await verifySessionToken(token, config.jwtSecret);
  if (!session) {
    reply.code(401).send({ ok: false, error: "Invalid session" });
    return null;
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
    reply.code(401).send({ ok: false, error: "Invalid session" });
    return null;
  }

  if (roleRank[user.role] < roleRank[minimumRole]) {
    reply.code(403).send({ ok: false, error: "Insufficient role" });
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}
