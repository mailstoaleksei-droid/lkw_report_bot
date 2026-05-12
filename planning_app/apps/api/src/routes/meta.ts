import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";

export async function registerMetaRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get("/api/meta", async () => ({
    ok: true,
    app: "LKW Planning App",
    mode: config.nodeEnv,
    features: {
      auth: "planned",
      imports: "planned",
      exports: "planned",
      telegramIntegration: "phase2",
    },
  }));
}

