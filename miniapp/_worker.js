// Cloudflare Pages Worker (advanced mode) for API routes.
// This file works with direct "Upload assets" deployments.

const REPORTS = [
  {
    id: "bericht",
    enabled: true,
    icon: "report",
    name: {
      en: "Bericht (Trucks by Company)",
      ru: "Отчет (Грузовики по фирмам)",
      de: "Bericht (LKW nach Firma)",
    },
    description: {
      en: "Weekly truck count by company (Container / Planen), 5 consecutive weeks",
      ru: "Еженедельный подсчет грузовиков по фирмам (Container / Planen), 5 недель подряд",
      de: "Woechentliche LKW-Zaehlung pro Firma (Container / Planen), 5 Wochen",
    },
    params: [
      {
        id: "year",
        type: "year",
        label: { en: "Year", ru: "Год" },
        min: 2024,
        max: 2030,
      },
      {
        id: "week",
        type: "week",
        label: { en: "Week", ru: "Неделя" },
        min: 1,
        max: 53,
      },
    ],
  },
  {
    id: "tankkarten",
    enabled: false,
    icon: "fuel",
    name: { en: "Fuel Cards", ru: "Топливные карты", de: "Tankkarten" },
    description: { en: "Coming soon", ru: "Скоро будет доступно", de: "Kommt bald" },
    params: [],
  },
  {
    id: "fahrer_zeiten",
    enabled: false,
    icon: "drivers",
    name: { en: "Driver Times", ru: "Время водителей", de: "Fahrerzeiten" },
    description: { en: "Coming soon", ru: "Скоро будет доступно", de: "Kommt bald" },
    params: [],
  },
  {
    id: "urlaub_plan",
    enabled: false,
    icon: "calendar",
    name: { en: "Vacation Plan", ru: "План отпусков", de: "Urlaubsplan" },
    description: { en: "Coming soon", ru: "Скоро будет доступно", de: "Kommt bald" },
    params: [],
  },
];
const REPORT_MAP = new Map(REPORTS.map((r) => [r.id, r]));
const USER_COOLDOWNS = new Map();
let LAST_COOLDOWN_CLEANUP_MS = 0;

function toBool(value, defaultValue = false) {
  if (typeof value !== "string") return defaultValue;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return defaultValue;
}

function toInt(value, defaultValue) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function getCooldownSec(env) {
  return Math.max(1, toInt(env.API_COOLDOWN_SEC, 5));
}

function checkRateLimit(userId, env) {
  const now = Date.now();
  const cooldownSec = getCooldownSec(env);
  const cooldownMs = cooldownSec * 1000;
  const untilMs = USER_COOLDOWNS.get(userId) || 0;
  if (untilMs > now) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((untilMs - now) / 1000)),
    };
  }

  USER_COOLDOWNS.set(userId, now + cooldownMs);

  // Keep memory bounded in long-lived isolates.
  if (USER_COOLDOWNS.size > 2000 && now - LAST_COOLDOWN_CLEANUP_MS > 60_000) {
    for (const [uid, ts] of USER_COOLDOWNS.entries()) {
      if (ts <= now) USER_COOLDOWNS.delete(uid);
    }
    LAST_COOLDOWN_CLEANUP_MS = now;
  }

  return { ok: true, cooldownSec };
}

function buildMeta(env) {
  const scheduleEnabled = toBool(env.SCHEDULE_ENABLED, false);
  const cron = env.SCHEDULE_CRON || "0 10 * * 1";
  const timezone = env.SCHEDULE_TIMEZONE || "Europe/Berlin";
  const reportType = env.SCHEDULE_REPORT_TYPE || "bericht";

  const staleAfterHours = Math.max(1, toInt(env.ETL_STALE_AFTER_HOURS, 12));
  const staleAfterSec = staleAfterHours * 3600;
  const lastImportAt = (env.ETL_LAST_IMPORT_AT || "").trim() || null;

  let ageSec = null;
  if (lastImportAt) {
    const ts = Date.parse(lastImportAt);
    if (Number.isFinite(ts)) {
      ageSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    }
  }

  return {
    ok: true,
    schedule: {
      enabled: scheduleEnabled,
      cron,
      timezone,
      report_type: reportType,
    },
    etl: {
      last_import_at: lastImportAt,
      age_sec: ageSec,
      is_stale: ageSec === null ? true : ageSec > staleAfterSec,
      stale_after_hours: staleAfterHours,
      source_name: ageSec === null ? null : "cloudflare_meta_env",
    },
    reports_count: REPORTS.length,
    backend: {
      mode: "pages_worker",
      hyperdrive_bound: Boolean(env.HYPERDRIVE),
    },
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseWhitelist(env) {
  const raw = String(env.WHITELIST_USER_IDS || "").trim();
  if (!raw) return new Set();
  const ids = raw
    .split(",")
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((x) => Number.isFinite(x) && x > 0);
  return new Set(ids);
}

function parseInitData(initDataRaw) {
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get("hash") || "";
  params.delete("hash");
  const lines = [];
  for (const [k, v] of [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    lines.push(`${k}=${v}`);
  }
  return {
    hash,
    params,
    dataCheckString: lines.join("\n"),
  };
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Raw(keyBytes, messageBytes) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, messageBytes);
  return new Uint8Array(sig);
}

function getBotToken(env) {
  return String(env.TELEGRAM_BOT_TOKEN || env.BOT_TOKEN || "").trim();
}

function parseTelegramUserFromInitData(initDataRaw) {
  try {
    const params = new URLSearchParams(String(initDataRaw || ""));
    const rawUser = params.get("user");
    if (!rawUser) return null;
    const user = JSON.parse(rawUser);
    return user && typeof user === "object" ? user : null;
  } catch {
    return null;
  }
}

async function fetchImageByUrl(url) {
  if (!url) return null;
  try {
    const resp = await fetch(url, { redirect: "follow" });
    if (!resp.ok) return null;
    const contentType = (resp.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) return null;
    const buf = await resp.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return null;
  }
}

async function fetchTelegramAvatarViaBotApi(userId, env) {
  const botToken = getBotToken(env);
  if (!botToken || !userId) return null;

  try {
    const apiBase = `https://api.telegram.org/bot${botToken}`;
    const photosResp = await fetch(
      `${apiBase}/getUserProfilePhotos?user_id=${encodeURIComponent(String(userId))}&limit=1`,
    );
    if (!photosResp.ok) return null;

    const photosData = await photosResp.json().catch(() => null);
    const fileId = photosData?.result?.photos?.[0]?.[0]?.file_id;
    if (!fileId) return null;

    const fileResp = await fetch(`${apiBase}/getFile?file_id=${encodeURIComponent(fileId)}`);
    if (!fileResp.ok) return null;
    const fileData = await fileResp.json().catch(() => null);
    const filePath = fileData?.result?.file_path;
    if (!filePath) return null;

    const imageUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    return fetchImageByUrl(imageUrl);
  } catch {
    return null;
  }
}

async function validateTelegramInitData(initDataRaw, env) {
  const raw = String(initDataRaw || "").trim();
  if (!raw) {
    return { ok: false, error: "Missing initData" };
  }

  const botToken = getBotToken(env);
  if (!botToken) {
    return { ok: false, error: "Bot token is not configured in Worker env" };
  }

  const parsed = parseInitData(raw);
  if (!parsed.hash) {
    return { ok: false, error: "initData hash is missing" };
  }

  const enc = new TextEncoder();
  // secret_key = HMAC_SHA256("WebAppData", bot_token)
  const secret = await hmacSha256Raw(enc.encode("WebAppData"), enc.encode(botToken));
  // calculated_hash = HMAC_SHA256(secret_key, data_check_string)
  const calc = await hmacSha256Raw(secret, enc.encode(parsed.dataCheckString));
  const calcHex = bytesToHex(calc);

  if (!constantTimeEqualHex(calcHex, parsed.hash)) {
    return { ok: false, error: "Invalid initData hash" };
  }

  const maxAge = Math.max(60, toInt(env.INIT_DATA_MAX_AGE_SEC, 300));
  const authDate = Number.parseInt(parsed.params.get("auth_date") || "", 10);
  if (Number.isFinite(authDate) && authDate > 0) {
    const age = Math.floor(Date.now() / 1000) - authDate;
    if (age > maxAge) {
      return { ok: false, error: "initData expired" };
    }
  }

  let userId = null;
  try {
    const userJson = parsed.params.get("user") || "";
    if (userJson) {
      const user = JSON.parse(userJson);
      const id = Number.parseInt(String(user?.id ?? ""), 10);
      if (Number.isFinite(id) && id > 0) userId = id;
    }
  } catch {
    return { ok: false, error: "Invalid user payload in initData" };
  }

  if (!userId) {
    return { ok: false, error: "User id is missing in initData" };
  }

  const whitelist = parseWhitelist(env);
  if (whitelist.size > 0 && !whitelist.has(userId)) {
    return { ok: false, error: "Access denied" };
  }

  return { ok: true, userId };
}

async function handleAvatar(request, env) {
  const url = new URL(request.url);
  const initDataRaw = url.searchParams.get("initData") || "";
  const auth = await validateTelegramInitData(initDataRaw, env);
  if (!auth.ok) {
    return new Response("Forbidden", {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const user = parseTelegramUserFromInitData(initDataRaw);
  const candidates = [];

  const photoUrl = String(user?.photo_url || "").trim();
  if (photoUrl) candidates.push(photoUrl);

  const username = String(user?.username || "").replace(/^@+/, "").trim();
  if (username) {
    candidates.push(`https://t.me/i/userpic/320/${encodeURIComponent(username)}.jpg`);
    candidates.push(`https://t.me/i/userpic/160/${encodeURIComponent(username.toLowerCase())}.jpg`);
  }

  for (const src of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const img = await fetchImageByUrl(src);
    if (img) return img;
  }

  const botAvatar = await fetchTelegramAvatarViaBotApi(auth.userId, env);
  if (botAvatar) return botAvatar;

  return new Response("", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

function validateGeneratePayload(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }

  const reportType = String(body.report_type || "").trim();
  if (!reportType) {
    return { ok: false, status: 400, error: "Missing report_type" };
  }

  const report = REPORT_MAP.get(reportType);
  if (!report) {
    return { ok: false, status: 400, error: `Unknown report_type: ${reportType}` };
  }
  if (!report.enabled) {
    return { ok: false, status: 400, error: `Report not enabled: ${reportType}` };
  }

  if (reportType === "bericht") {
    const year = Number.parseInt(String(body.year ?? ""), 10);
    const week = Number.parseInt(String(body.week ?? ""), 10);
    if (!Number.isFinite(year) || !Number.isFinite(week)) {
      return { ok: false, status: 400, error: "Invalid year/week" };
    }
    if (!(year >= 2020 && year <= 2100 && week >= 1 && week <= 53)) {
      return { ok: false, status: 400, error: "Year/week out of range" };
    }
    return { ok: true, reportType, year, week };
  }

  return { ok: true, reportType };
}

async function handleGenerate(request, env) {
  const body = await parseJsonBody(request);
  const valid = validateGeneratePayload(body);
  if (!valid.ok) {
    return json({ ok: false, error: valid.error }, valid.status, {
      "Cache-Control": "no-store",
    });
  }

  const auth = await validateTelegramInitData(body.initData, env);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, 403, {
      "Cache-Control": "no-store",
    });
  }

  const rl = checkRateLimit(auth.userId, env);
  if (!rl.ok) {
    return json(
      {
        ok: false,
        error: `Please wait ${rl.retryAfterSec}s`,
        code: "RATE_LIMITED",
        retry_after_sec: rl.retryAfterSec,
      },
      429,
      {
        "Cache-Control": "no-store",
        "Retry-After": String(rl.retryAfterSec),
      },
    );
  }

  // Phase 2.4 MVP: endpoint exists with strict validation and stable JSON contract.
  // Real SQL->PDF generation is implemented in follow-up steps (2.5+3.x).
  return json(
    {
      ok: false,
      error: "Cloud SQL report generation is not enabled yet",
      code: "NOT_IMPLEMENTED",
      report_type: valid.reportType,
      user_id: auth.userId,
      request_id: crypto.randomUUID(),
    },
    501,
    { "Cache-Control": "no-store" },
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/reports") {
      return json(REPORTS, 200, {
        "Cache-Control": "public, max-age=60",
      });
    }
    
    if (request.method === "GET" && url.pathname === "/api/meta") {
      return json(buildMeta(env), 200, {
        "Cache-Control": "no-store",
      });
    }

    if (request.method === "POST" && url.pathname === "/api/generate") {
      return handleGenerate(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/avatar") {
      return handleAvatar(request, env);
    }

    // Keep /api paths explicit while endpoints are implemented step-by-step.
    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "API endpoint is not implemented yet" }, 404, {
        "Cache-Control": "no-store",
      });
    }

    // Static assets and index.html.
    return env.ASSETS.fetch(request);
  },
};
