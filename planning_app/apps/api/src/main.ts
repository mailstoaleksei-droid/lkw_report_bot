import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { loadConfig } from "./config.js";
import { closePrisma } from "./prisma.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerImportRoutes } from "./routes/imports.js";
import { registerMetaRoutes } from "./routes/meta.js";

const app = Fastify({ logger: true });
const config = loadConfig();

await app.register(cors, {
  origin: config.corsOrigin,
  credentials: true,
});

await app.register(cookie);

await registerHealthRoutes(app);
await registerMetaRoutes(app, config);
await registerAuthRoutes(app, config);
await registerImportRoutes(app);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info({ signal }, "Shutting down");
    await closePrisma();
    await app.close();
    process.exit(0);
  });
}

await app.listen({ port: config.apiPort, host: config.apiHost });
