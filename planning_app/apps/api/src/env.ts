import fs from "node:fs";
import path from "node:path";

function loadEnvFile(envPath: string): boolean {
  try {
    if (!fs.existsSync(envPath)) return false;
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
      const [key, ...rest] = line.split("=");
      if (!process.env[key]) process.env[key] = rest.join("=").trim();
    }
    return true;
  } catch {
    // Environment loading is best-effort for local scripts.
    return false;
  }
}

export function loadEnvFromNearestProjectRoot(startDir = process.cwd()): void {
  let currentDir = startDir;
  for (let depth = 0; depth < 6; depth += 1) {
    if (loadEnvFile(path.join(currentDir, ".env"))) return;
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return;
    currentDir = parentDir;
  }
}
