import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,
});

await app.register(cookie);
await app.register(jwt, {
  secret: process.env.JWT_SECRET || "development_only_change_me",
});

app.get("/healthz", async () => ({
  ok: true,
  service: "lkw-planning-api",
  time: new Date().toISOString(),
}));

app.get("/api/meta", async () => ({
  ok: true,
  app: "LKW Planning App",
  mode: process.env.NODE_ENV || "development",
}));

const port = Number.parseInt(process.env.API_PORT || "4000", 10);
const host = process.env.API_HOST || "0.0.0.0";

await app.listen({ port, host });

