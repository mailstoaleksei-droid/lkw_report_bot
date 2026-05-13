import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { loadConfig } from "./config.js";
import { closePrisma } from "./prisma.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerAssignmentRoutes } from "./routes/assignments.js";
import { registerDriverRoutes } from "./routes/drivers.js";
import { registerExportRoutes } from "./routes/exports.js";
import { registerImportRoutes } from "./routes/imports.js";
import { registerLkwRoutes } from "./routes/lkw.js";
import { registerMetaRoutes } from "./routes/meta.js";
import { registerOrderRoutes } from "./routes/orders.js";
import { registerPlanningRoutes } from "./routes/planning.js";
import { registerUserRoutes } from "./routes/users.js";

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
await registerImportRoutes(app, config);
await registerLkwRoutes(app, config);
await registerDriverRoutes(app, config);
await registerOrderRoutes(app, config);
await registerAssignmentRoutes(app, config);
await registerPlanningRoutes(app, config);
await registerAuditRoutes(app, config);
await registerExportRoutes(app, config);
await registerUserRoutes(app, config);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info({ signal }, "Shutting down");
    await closePrisma();
    await app.close();
    process.exit(0);
  });
}

await app.listen({ port: config.apiPort, host: config.apiHost });
