export type AppConfig = {
  nodeEnv: string;
  apiHost: string;
  apiPort: number;
  corsOrigin: string;
  jwtSecret: string;
  sessionCookieName: string;
  sessionCookieSecure: boolean;
};

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV || "development";
  return {
    nodeEnv,
    apiHost: process.env.API_HOST || "0.0.0.0",
    apiPort: parsePort(process.env.API_PORT, 4000),
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
    jwtSecret: process.env.JWT_SECRET || "development_only_change_me",
    sessionCookieName: process.env.SESSION_COOKIE_NAME || "lkw_planning_session",
    sessionCookieSecure: parseBoolean(process.env.SESSION_COOKIE_SECURE, nodeEnv === "production"),
  };
}
