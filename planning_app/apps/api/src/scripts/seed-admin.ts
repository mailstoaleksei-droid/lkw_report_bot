import { RoleName } from "@prisma/client";
import fs from "node:fs";
import { hashPassword } from "../auth/password.js";
import { prisma, closePrisma } from "../prisma.js";

function loadEnvFile(path = ".env"): void {
  try {
    if (!fs.existsSync(path)) return;
    const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
      const [key, ...rest] = line.split("=");
      if (!process.env[key]) process.env[key] = rest.join("=").trim();
    }
  } catch {
    // Environment loading is best-effort for local seed execution.
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const displayName = (process.env.ADMIN_DISPLAY_NAME || "Admin").trim();

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required for seed");
  }
  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters");
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email },
    update: {
      displayName,
      role: RoleName.ADMIN,
      isActive: true,
      passwordHash,
    },
    create: {
      email,
      displayName,
      role: RoleName.ADMIN,
      passwordHash,
    },
  });

  console.log(`Admin user ready: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePrisma();
  });
