import { SignJWT, jwtVerify } from "jose";

export type SessionTokenPayload = {
  userId: string;
  role: string;
};

function getSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionTokenPayload, secret: string): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSecret(secret));
}

export async function verifySessionToken(token: string, secret: string): Promise<SessionTokenPayload | null> {
  try {
    const verified = await jwtVerify(token, getSecret(secret));
    const userId = verified.payload.sub;
    const role = typeof verified.payload.role === "string" ? verified.payload.role : "";
    if (!userId || !role) return null;
    return { userId, role };
  } catch {
    return null;
  }
}

