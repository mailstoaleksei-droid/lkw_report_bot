// Cloudflare Pages Worker (advanced mode) for API routes.
// This file works with direct "Upload assets" deployments.
import { PDFDocument, StandardFonts, rgb } from "./vendor/pdf-lib.esm.js";

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
        min: 2025,
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
    id: "data_plan",
    enabled: true,
    icon: "calendar",
    name: {
      en: "Data/Plan (LKW Weekly Drivers)",
      ru: "Data/Plan (водители по неделям)",
      de: "Data/Plan (LKW Fahrer pro Woche)",
    },
    description: {
      en: "Truck plan report: selected ISO week plus 3 weeks ahead",
      ru: "План по LKW: выбранная неделя и 3 недели вперед",
      de: "LKW-Plan: ausgewaehlte Woche plus 3 Wochen",
    },
    params: [
      {
        id: "year",
        type: "year",
        label: { en: "Year", ru: "Год" },
        min: 2025,
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
    id: "data_data",
    enabled: true,
    icon: "calendar",
    name: {
      en: "Data/Plan (Kalender Daily Drivers)",
      ru: "Data/Plan (календарь по дням)",
      de: "Data/Plan (Kalender Fahrer pro Tag)",
    },
    description: {
      en: "Selected ISO week only, 7 days (Mon-Sun) by LKW",
      ru: "Только выбранная неделя ISO, 7 дней (Пн-Вс) по LKW",
      de: "Nur ausgewaehlte ISO-Woche, 7 Tage (Mo-So) pro LKW",
    },
    params: [
      {
        id: "year",
        type: "year",
        label: { en: "Year", ru: "Год" },
        min: 2025,
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
const USER_ALLOW_CACHE = new Map();
let LAST_ALLOW_CACHE_CLEANUP_MS = 0;
const BERICHT_COMPANY_SQL = `
WITH ref AS (
  SELECT to_date($1::text || '-W' || lpad($2::text, 2, '0') || '-1', 'IYYY-"W"IW-ID')::date AS week_monday
), weeks AS (
  SELECT
    extract(isoyear FROM (week_monday + (g.n * interval '7 day')))::int AS iso_year,
    extract(week FROM (week_monday + (g.n * interval '7 day')))::int AS iso_week,
    (week_monday + (g.n * interval '7 day'))::date AS week_start
  FROM ref
  CROSS JOIN generate_series(0,3) AS g(n)
), base AS (
  SELECT
    w.iso_year,
    w.iso_week,
    w.week_start,
    coalesce(c.name, 'Unknown') AS company_name,
    COUNT(DISTINCT CASE WHEN s.assignment_type='assignment' AND t.truck_type='Container' THEN s.truck_id END)::int AS container_count,
    COUNT(DISTINCT CASE WHEN s.assignment_type='assignment' AND t.truck_type='Planen' THEN s.truck_id END)::int AS planen_count,
    COUNT(DISTINCT CASE WHEN s.assignment_type='assignment' THEN s.truck_id END)::int AS total_count
  FROM weeks w
  LEFT JOIN schedules s ON s.iso_year = w.iso_year AND s.iso_week = w.iso_week
  LEFT JOIN trucks t ON t.id = s.truck_id
  LEFT JOIN companies c ON c.id = coalesce(s.company_id, t.company_id)
  GROUP BY w.iso_year, w.iso_week, w.week_start, coalesce(c.name, 'Unknown')
)
SELECT iso_year, iso_week, week_start, company_name, container_count, planen_count, total_count
FROM base
WHERE company_name <> 'Unknown'
ORDER BY week_start, company_name;
`;

const BERICHT_WEEK_SUMMARY_SQL = `
WITH ref AS (
  SELECT to_date($1::text || '-W' || lpad($2::text, 2, '0') || '-1', 'IYYY-"W"IW-ID')::date AS week_monday
), weeks AS (
  SELECT
    extract(isoyear FROM (week_monday + (g.n * interval '7 day')))::int AS iso_year,
    extract(week FROM (week_monday + (g.n * interval '7 day')))::int AS iso_week,
    (week_monday + (g.n * interval '7 day'))::date AS week_start
  FROM ref
  CROSS JOIN generate_series(0,3) AS g(n)
), occupied AS (
  SELECT
    w.iso_year,
    w.iso_week,
    w.week_start,
    COUNT(DISTINCT CASE WHEN s.assignment_type='assignment' AND t.truck_type='Container' THEN s.truck_id END)::int AS occupied_container,
    COUNT(DISTINCT CASE WHEN s.assignment_type='assignment' AND t.truck_type='Planen' THEN s.truck_id END)::int AS occupied_planen,
    COUNT(DISTINCT CASE WHEN s.assignment_type='assignment' THEN s.truck_id END)::int AS occupied_total
  FROM weeks w
  LEFT JOIN schedules s ON s.iso_year = w.iso_year AND s.iso_week = w.iso_week
  LEFT JOIN trucks t ON t.id = s.truck_id
  GROUP BY w.iso_year, w.iso_week, w.week_start
), soll AS (
  SELECT
    w.iso_year,
    w.iso_week,
    w.week_start,
    COUNT(*) FILTER (
      WHERE t.truck_type='Container'
        AND (
          (t.status_since IS NULL AND t.is_active = true)
          OR
          (t.status_since IS NOT NULL AND w.week_start < t.status_since)
        )
    )::int AS soll_container,
    COUNT(*) FILTER (
      WHERE t.truck_type='Planen'
        AND (
          (t.status_since IS NULL AND t.is_active = true)
          OR
          (t.status_since IS NOT NULL AND w.week_start < t.status_since)
        )
    )::int AS soll_planen
  FROM weeks w
  CROSS JOIN trucks t
  GROUP BY w.iso_year, w.iso_week, w.week_start
)
SELECT
  w.iso_year,
  w.iso_week,
  w.week_start,
  COALESCE(o.occupied_container, 0) AS occupied_container,
  COALESCE(o.occupied_planen, 0) AS occupied_planen,
  COALESCE(o.occupied_total, 0) AS occupied_total,
  COALESCE(s.soll_container, 0) AS soll_container,
  COALESCE(s.soll_planen, 0) AS soll_planen,
  COALESCE(s.soll_container, 0) + COALESCE(s.soll_planen, 0) AS soll_total
FROM weeks w
LEFT JOIN occupied o ON o.iso_year = w.iso_year AND o.iso_week = w.iso_week
LEFT JOIN soll s ON s.iso_year = w.iso_year AND s.iso_week = w.iso_week
ORDER BY w.week_start;
`;

const DATA_PLAN_GRID_SQL = `
WITH ref AS (
  SELECT to_date($1::text || '-W' || lpad($2::text, 2, '0') || '-1', 'IYYY-"W"IW-ID')::date AS week_monday
), weeks AS (
  SELECT
    g.n::int AS week_idx,
    extract(isoyear FROM (week_monday + (g.n * interval '7 day')))::int AS iso_year,
    extract(week FROM (week_monday + (g.n * interval '7 day')))::int AS iso_week,
    (week_monday + (g.n * interval '7 day'))::date AS week_start
  FROM ref
  CROSS JOIN generate_series(0,3) AS g(n)
), agg_source AS (
  SELECT
    s.truck_id,
    s.iso_year::int AS iso_year,
    s.iso_week::int AS iso_week,
    NULLIF(TRIM(COALESCE(NULLIF(s.shift_code, ''), NULLIF(s.raw_payload->>'assignment_value', ''))), '') AS value_text
  FROM schedules s
  JOIN weeks w
    ON w.iso_year = s.iso_year
   AND w.iso_week = s.iso_week
), agg AS (
  SELECT
    truck_id,
    iso_year,
    iso_week,
    string_agg(DISTINCT value_text, ' / ' ORDER BY value_text) AS week_value
  FROM agg_source
  WHERE value_text IS NOT NULL
  GROUP BY truck_id, iso_year, iso_week
)
SELECT
  t.external_id AS lkw_id,
  COALESCE(NULLIF(t.plate_number, ''), NULLIF(t.raw_payload->>'LKW-Nummer', ''), NULLIF(t.raw_payload->>'Number', '')) AS lkw_nummer,
  COALESCE(NULLIF(t.raw_payload->>'Marke/Modell', ''), NULLIF(t.raw_payload->>'Brand/Model', '')) AS marke_modell,
  w.week_idx,
  w.iso_year,
  w.iso_week,
  COALESCE(a.week_value, '') AS week_value
FROM trucks t
CROSS JOIN weeks w
LEFT JOIN agg a
  ON a.truck_id = t.id
 AND a.iso_year = w.iso_year
 AND a.iso_week = w.iso_week
WHERE COALESCE(NULLIF(t.external_id, ''), '') <> ''
ORDER BY t.external_id, w.week_idx;
`;

const DATA_WEEK_GRID_SQL = `
WITH ref AS (
  SELECT to_date($1::text || '-W' || lpad($2::text, 2, '0') || '-1', 'IYYY-"W"IW-ID')::date AS week_monday
), days AS (
  SELECT
    g.n::int AS day_idx,
    (week_monday + (g.n * interval '1 day'))::date AS work_date
  FROM ref
  CROSS JOIN generate_series(0,6) AS g(n)
), agg_day_source AS (
  SELECT
    s.truck_id,
    s.work_date::date AS work_date,
    NULLIF(
      TRIM(
        COALESCE(
          NULLIF(d.full_name, ''),
          NULLIF(s.shift_code, ''),
          NULLIF(s.raw_payload->>'assignment_value', ''),
          NULLIF(s.raw_payload->>'Fahrername', ''),
          NULLIF(s.raw_payload->>'driver_name', '')
        )
      ),
      ''
    ) AS value_text
  FROM schedules s
  JOIN days x ON x.work_date = s.work_date
  LEFT JOIN drivers d ON d.id = s.driver_id
), agg_day AS (
  SELECT
    truck_id,
    work_date,
    string_agg(DISTINCT value_text, ' / ' ORDER BY value_text) AS day_value
  FROM agg_day_source
  WHERE value_text IS NOT NULL
  GROUP BY truck_id, work_date
), agg_week_source AS (
  SELECT
    s.truck_id,
    NULLIF(
      TRIM(
        COALESCE(
          NULLIF(d.full_name, ''),
          NULLIF(s.shift_code, ''),
          NULLIF(s.raw_payload->>'assignment_value', ''),
          NULLIF(s.raw_payload->>'Fahrername', ''),
          NULLIF(s.raw_payload->>'driver_name', '')
        )
      ),
      ''
    ) AS value_text
  FROM schedules s
  LEFT JOIN drivers d ON d.id = s.driver_id
  WHERE s.iso_year = $1::int
    AND s.iso_week = $2::int
), agg_week AS (
  SELECT
    truck_id,
    string_agg(DISTINCT value_text, ' / ' ORDER BY value_text) AS week_value
  FROM agg_week_source
  WHERE value_text IS NOT NULL
  GROUP BY truck_id
)
SELECT
  t.external_id AS lkw_id,
  COALESCE(NULLIF(t.plate_number, ''), NULLIF(t.raw_payload->>'LKW-Nummer', ''), NULLIF(t.raw_payload->>'Number', '')) AS lkw_nummer,
  COALESCE(NULLIF(t.truck_type, ''), NULLIF(t.raw_payload->>'LKW-Typ', ''), NULLIF(t.raw_payload->>'Type', '')) AS lkw_typ,
  x.day_idx,
  x.work_date,
  COALESCE(ad.day_value, aw.week_value, '') AS day_value
FROM trucks t
CROSS JOIN days x
LEFT JOIN agg_day ad
  ON ad.truck_id = t.id
 AND ad.work_date = x.work_date
LEFT JOIN agg_week aw
  ON aw.truck_id = t.id
WHERE COALESCE(NULLIF(t.external_id, ''), '') <> ''
ORDER BY t.external_id, x.day_idx;
`;

const DOCK_KIND_TO_REPORT_TYPE = {
  "lkw-list": "lkw_list",
  "drivers-list": "drivers_list",
  "fuel-cards": "fuel_cards",
};

const REPORT_TYPE_TO_DOCK_KIND = {
  lkw_list: "lkw-list",
  drivers_list: "drivers-list",
  fuel_cards: "fuel-cards",
};

const LKW_LIST_SQL = `
SELECT
  t.external_id AS lkw_id,
  COALESCE(NULLIF(t.plate_number, ''), NULLIF(t.raw_payload->>'LKW-Nummer', ''), NULLIF(t.raw_payload->>'Number', '')) AS lkw_nummer,
  COALESCE(NULLIF(t.raw_payload->>'Marke/Modell', ''), NULLIF(t.raw_payload->>'Brand/Model', '')) AS marke_modell,
  COALESCE(NULLIF(t.truck_type, ''), NULLIF(t.raw_payload->>'LKW-Typ', ''), NULLIF(t.raw_payload->>'Type', '')) AS lkw_typ,
  COALESCE(NULLIF(c.name, ''), NULLIF(t.raw_payload->>'Firma', ''), NULLIF(t.raw_payload->>'Company', '')) AS firma,
  COALESCE(NULLIF(t.status, ''), NULLIF(t.raw_payload->>'Status', '')) AS verkauft,
  COALESCE(to_char(t.status_since, 'DD/MM/YYYY'), NULLIF(t.raw_payload->>'Datum verkauft', ''), NULLIF(t.raw_payload->>'Sale Date', '')) AS datum_verkauft,
  COALESCE(NULLIF(t.raw_payload->>'Telefonnummer', ''), NULLIF(t.raw_payload->>'Phone Number', ''), NULLIF(t.raw_payload->>'Phone', '')) AS telefonnummer,
  COALESCE(NULLIF(t.raw_payload->>'DKV Card', ''), NULLIF(t.raw_payload->>'DKV', '')) AS dkv_card,
  COALESCE(NULLIF(t.raw_payload->>'Shell Card', ''), NULLIF(t.raw_payload->>'Shell', '')) AS shell_card,
  COALESCE(NULLIF(t.raw_payload->>'Tankpool Card', ''), NULLIF(t.raw_payload->>'Tankpool', '')) AS tankpool_card
FROM trucks t
LEFT JOIN companies c ON c.id = t.company_id
ORDER BY t.external_id;
`;

const DRIVERS_LIST_SQL = `
SELECT
  d.external_id AS fahrer_id,
  d.full_name AS fahrername,
  COALESCE(NULLIF(c.name, ''), NULLIF(d.raw_payload->>'Firma', ''), NULLIF(d.raw_payload->>'Company', '')) AS firma,
  COALESCE(NULLIF(d.phone, ''), NULLIF(d.raw_payload->>'Telefonnummer', ''), NULLIF(d.raw_payload->>'Phone', '')) AS telefonnummer,
  COALESCE(NULLIF(d.raw_payload->>'LKW-Typ', ''), NULLIF(d.raw_payload->>'Type', '')) AS lkw_typ,
  COALESCE(NULLIF(d.raw_payload->>'Status', ''), CASE WHEN d.is_active THEN 'Aktiv' ELSE 'Entlassen' END) AS status,
  COALESCE(NULLIF(d.raw_payload->>'Datum entlassen', ''), NULLIF(d.raw_payload->>'Dismiss Date', '')) AS datum_entlassen
FROM drivers d
LEFT JOIN companies c ON c.id = d.company_id
ORDER BY d.external_id;
`;

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

function getAllowedUsersCacheSec(env) {
  return Math.max(10, toInt(env.ALLOWED_USERS_CACHE_SEC, 300));
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

  const staleAfterHours = Math.max(1, toInt(env.ETL_STALE_AFTER_HOURS, 4));
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

function toBoolish(value) {
  if (typeof value === "boolean") return value;
  const v = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "t", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "f", "no", "n", "off"].includes(v)) return false;
  return false;
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

function getDbConnectionString(env) {
  const fallback = String(env.DATABASE_URL || "").trim();
  if (fallback) return fallback;

  const hd = env?.HYPERDRIVE;
  if (hd && typeof hd.connectionString === "string" && hd.connectionString.trim()) {
    const fromHyperdrive = hd.connectionString.trim();
    // Neon HTTP SQL endpoint requires original Neon host.
    if (fromHyperdrive.includes(".neon.tech")) return fromHyperdrive;
  }
  return "";
}

function getNeonSqlEndpoint(connectionString) {
  const u = new URL(connectionString);
  const host = String(u.hostname || "");
  const dot = host.indexOf(".");
  if (dot <= 0 || dot >= host.length - 1) {
    throw new Error("Invalid database host in connection string");
  }
  // Neon serverless HTTP endpoint is hosted on api.<rest_of_hostname>/sql
  const apiHost = `api.${host.slice(dot + 1)}`;
  return `https://${apiHost}/sql`;
}

async function queryNeon(connectionString, query, params = []) {
  const endpoint = getNeonSqlEndpoint(connectionString);
  const payload = { query, params };
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Neon-Connection-String": connectionString,
      "Neon-Raw-Text-Output": "true",
      "Neon-Array-Mode": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    let message = `SQL request failed with status ${resp.status}`;
    try {
      const maybeJson = await resp.json();
      if (maybeJson?.message) message = maybeJson.message;
    } catch {
      const text = await resp.text().catch(() => "");
      if (text) message = text.slice(0, 500);
    }
    if (resp.status === 530) {
      message = "Neon HTTP endpoint is unreachable. Set DATABASE_URL secret with original Neon connection string.";
    }
    throw new Error(message);
  }

  const data = await resp.json();
  const fields = Array.isArray(data?.fields) ? data.fields : [];
  const names = fields.map((f) => String(f?.name || ""));
  const rowsRaw = Array.isArray(data?.rows) ? data.rows : [];
  const rows = rowsRaw.map((row) => {
    if (!Array.isArray(row)) return {};
    const obj = {};
    for (let i = 0; i < names.length; i += 1) {
      obj[names[i]] = row[i] ?? null;
    }
    return obj;
  });
  return { rows, rowCount: Number.parseInt(String(data?.rowCount ?? rows.length), 10) || rows.length };
}

async function writeReportLog(connectionString, payload) {
  const paramsJson = JSON.stringify(payload?.params || {});
  await queryNeon(
    connectionString,
    `
      INSERT INTO reports_log (
        user_id,
        chat_id,
        report_type,
        iso_year,
        iso_week,
        params,
        status,
        requested_at,
        completed_at,
        duration_ms,
        output_key,
        error_message
      )
      VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7,
        NOW(), CASE WHEN $7 IN ('success', 'failed') THEN NOW() ELSE NULL END,
        $8, $9, $10
      )
    `,
    [
      Number.parseInt(String(payload?.userId ?? "0"), 10),
      Number.parseInt(String(payload?.chatId ?? payload?.userId ?? "0"), 10),
      String(payload?.reportType || "unknown"),
      payload?.isoYear ?? null,
      payload?.isoWeek ?? null,
      paramsJson,
      String(payload?.status || "success"),
      payload?.durationMs ?? null,
      payload?.outputKey ?? null,
      payload?.errorMessage ?? null,
    ],
  );
}

function makeBerichtFilename(year, week) {
  return `bericht_${Number.parseInt(String(year), 10)}_w${pad2(Number.parseInt(String(week), 10))}.pdf`;
}

function makeDataPlanFilename(year, week) {
  return `data_plan_${Number.parseInt(String(year), 10)}_w${pad2(Number.parseInt(String(week), 10))}_plus3.pdf`;
}

function makeDataWeekFilename(year, week) {
  return `data_week_${Number.parseInt(String(year), 10)}_w${pad2(Number.parseInt(String(week), 10))}.pdf`;
}

function makeDockFilename(kind, at = new Date()) {
  const stamp = formatUtcDateStamp(at);
  if (kind === "lkw-list") return `lkw_list_${stamp}.pdf`;
  if (kind === "drivers-list") return `drivers_list_${stamp}.pdf`;
  if (kind === "fuel-cards") return `fuel_cards_${stamp}.pdf`;
  return `report_${stamp}.pdf`;
}

async function isUserAllowedInDb(userId, env, connectionString) {
  const uid = Number.parseInt(String(userId ?? ""), 10);
  if (!Number.isFinite(uid) || uid <= 0) return false;

  const now = Date.now();
  const ttlMs = getAllowedUsersCacheSec(env) * 1000;
  const cached = USER_ALLOW_CACHE.get(uid);
  if (cached && cached.untilMs > now) {
    return Boolean(cached.allowed);
  }

  const result = await queryNeon(
    connectionString,
    `
      SELECT is_active
      FROM allowed_users
      WHERE telegram_user_id = $1
      LIMIT 1
    `,
    [uid],
  );
  const allowed = result.rows.length > 0 && toBoolish(result.rows[0].is_active);

  USER_ALLOW_CACHE.set(uid, { allowed, untilMs: now + ttlMs });
  if (USER_ALLOW_CACHE.size > 5000 && now - LAST_ALLOW_CACHE_CLEANUP_MS > 60_000) {
    for (const [k, v] of USER_ALLOW_CACHE.entries()) {
      if (!v || v.untilMs <= now) USER_ALLOW_CACHE.delete(k);
    }
    LAST_ALLOW_CACHE_CLEANUP_MS = now;
  }
  return allowed;
}

function toIntSafe(value, fallback = 0) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatUtcDateStamp(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  return `${y}${m}${d}`;
}

function safeText(value, fallback = "-") {
  const s = String(value ?? "").trim();
  return s || fallback;
}

function normalizeAscii(text) {
  return String(text || "")
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("Ä", "Ae")
    .replaceAll("Ö", "Oe")
    .replaceAll("Ü", "Ue")
    .replaceAll("ß", "ss")
    .replace(/[^\x20-\x7E]/g, "?");
}

function escapePdfText(text) {
  return normalizeAscii(text)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function buildSimplePdf({ title, subtitle, lines, pageWidth = 595, pageHeight = 842 }) {
  const commands = [];
  let y = Number(pageHeight) - 32;

  commands.push("BT");
  commands.push("/F1 16 Tf");
  commands.push(`40 ${y} Td`);
  commands.push(`(${escapePdfText(title)}) Tj`);
  commands.push("ET");
  y -= 22;

  commands.push("BT");
  commands.push("/F1 10 Tf");
  commands.push(`40 ${y} Td`);
  commands.push(`(${escapePdfText(subtitle)}) Tj`);
  commands.push("ET");
  y -= 20;

  for (const line of lines) {
    if (y < 40) break;
    commands.push("BT");
    commands.push("/F1 9 Tf");
    commands.push(`40 ${y} Td`);
    commands.push(`(${escapePdfText(line)}) Tj`);
    commands.push("ET");
    y -= 13;
  }

  const content = `${commands.join("\n")}\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${Math.max(200, toIntSafe(pageWidth, 595))} ${Math.max(200, toIntSafe(pageHeight, 842))}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

function weekKey(isoYear, isoWeek) {
  return `${toIntSafe(isoYear)}-${pad2(toIntSafe(isoWeek))}`;
}

function sortWeekKeysAsc(a, b) {
  const [ya, wa] = String(a).split("-");
  const [yb, wb] = String(b).split("-");
  const yearDiff = toIntSafe(ya) - toIntSafe(yb);
  if (yearDiff !== 0) return yearDiff;
  return toIntSafe(wa) - toIntSafe(wb);
}

function formatBerichtLines(rows, weekSummaries = []) {
  const lines = [];
  const groupedRows = new Map();
  for (const row of rows || []) {
    const key = weekKey(row.iso_year, row.iso_week);
    if (!groupedRows.has(key)) groupedRows.set(key, []);
    groupedRows.get(key).push(row);
  }

  const summaryByWeek = new Map();
  for (const s of weekSummaries || []) {
    summaryByWeek.set(weekKey(s.iso_year, s.iso_week), s);
  }

  const orderedWeeks = summaryByWeek.size
    ? Array.from(summaryByWeek.keys())
    : Array.from(groupedRows.keys()).sort(sortWeekKeysAsc);

  if (orderedWeeks.length === 0) {
    return ["No data for selected period."];
  }

  lines.push("WEEK  | COMPANY                       | CONT | PLAN | TOTAL");
  lines.push("------+-------------------------------+------+------+------");

  for (const key of orderedWeeks) {
    const items = groupedRows.get(key) || [];
    for (const row of items) {
      const company = String(row.company_name || "").slice(0, 29).padEnd(29, " ");
      const cont = String(toIntSafe(row.container_count)).padStart(4, " ");
      const plan = String(toIntSafe(row.planen_count)).padStart(4, " ");
      const total = String(toIntSafe(row.total_count)).padStart(5, " ");
      lines.push(`${key} | ${company} | ${cont} | ${plan} | ${total}`);
    }
    if (items.length === 0) {
      lines.push(`${key} | (no companies)                |    0 |    0 |    0`);
    }

    const s = summaryByWeek.get(key) || {};
    lines.push(
      `      | Besetzte LKW                  | ${String(toIntSafe(s.occupied_container)).padStart(4, " ")} | ${String(toIntSafe(s.occupied_planen)).padStart(4, " ")} | ${String(toIntSafe(s.occupied_total)).padStart(5, " ")}`,
    );
    lines.push(
      `      | Soll                          | ${String(toIntSafe(s.soll_container)).padStart(4, " ")} | ${String(toIntSafe(s.soll_planen)).padStart(4, " ")} | ${String(toIntSafe(s.soll_total)).padStart(5, " ")}`,
    );
    lines.push("------+-------------------------------+------+------+------");
  }

  return lines;
}

function drawBerichtTableHeader({ page, boldFont, startX, y, colDefs }) {
  const headerBg = rgb(0.92, 0.96, 1);
  const borderColor = rgb(0.72, 0.82, 0.95);
  const textColor = rgb(0.1, 0.2, 0.35);
  const rowHeight = 18;
  const tableWidth = colDefs.reduce((s, c) => s + c.width, 0);

  page.drawRectangle({
    x: startX,
    y: y - rowHeight + 2,
    width: tableWidth,
    height: rowHeight,
    color: headerBg,
    borderColor,
    borderWidth: 1,
  });

  let x = startX;
  for (const col of colDefs) {
    page.drawText(col.label, {
      x: x + 4,
      y: y - 12,
      size: 9,
      font: boldFont,
      color: textColor,
    });
    x += col.width;
    if (x < startX + tableWidth - 1) {
      page.drawLine({
        start: { x, y: y - rowHeight + 2 },
        end: { x, y: y + 2 },
        thickness: 1,
        color: borderColor,
      });
    }
  }
  return { nextY: y - rowHeight };
}

async function buildBerichtPdfWithPdfLib({ year, week, userId, rows, weekSummaries = [] }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [595, 842]; // A4 portrait
  const margin = 36;
  const lineHeight = 14;
  const startX = margin;
  const colDefs = [
    { key: "company", label: "Company", width: 330, align: "left" },
    { key: "container", label: "Container", width: 70, align: "right" },
    { key: "planen", label: "Planen", width: 65, align: "right" },
    { key: "total", label: "Total", width: 65, align: "right" },
  ];
  const tableWidth = colDefs.reduce((s, c) => s + c.width, 0);
  const tableBorder = rgb(0.78, 0.86, 0.96);
  const textColor = rgb(0.08, 0.16, 0.28);

  const groupedRows = new Map();
  for (const row of rows || []) {
    const key = weekKey(row.iso_year, row.iso_week);
    if (!groupedRows.has(key)) groupedRows.set(key, []);
    groupedRows.get(key).push(row);
  }

  const summaryByWeek = new Map();
  for (const s of weekSummaries || []) {
    summaryByWeek.set(weekKey(s.iso_year, s.iso_week), s);
  }

  const orderedWeeks = summaryByWeek.size
    ? Array.from(summaryByWeek.keys())
    : Array.from(groupedRows.keys()).sort(sortWeekKeysAsc);

  const firstSummary = weekSummaries?.[0] || null;
  const lastSummary = weekSummaries?.[weekSummaries.length - 1] || null;
  const periodStart = firstSummary
    ? `${toIntSafe(firstSummary.iso_year)}/W${pad2(toIntSafe(firstSummary.iso_week))}`
    : `${year}/W${pad2(week)}`;
  const periodEnd = lastSummary
    ? `${toIntSafe(lastSummary.iso_year)}/W${pad2(toIntSafe(lastSummary.iso_week))}`
    : periodStart;
  const periodLabel = periodStart === periodEnd ? periodStart : `${periodStart} - ${periodEnd}`;

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawPageHeader = () => {
    page.drawText(`Bericht (Trucks by Company) ${periodLabel}`, {
      x: margin,
      y,
      size: 14,
      font: boldFont,
      color: textColor,
    });
    y -= 18;
    page.drawText(`Generated: ${new Date().toISOString()} UTC | User: ${userId}`, {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.24, 0.32, 0.44),
    });
    y -= 14;
  };

  const ensureSpace = (neededHeight) => {
    if (y - neededHeight >= margin) return;
    page = pdfDoc.addPage(pageSize);
    y = page.getHeight() - margin;
    drawPageHeader();
  };

  const drawDataRow = (data, rowY, rowBg) => {
    if (rowBg) {
      page.drawRectangle({
        x: startX,
        y: rowY - lineHeight + 3,
        width: tableWidth,
        height: lineHeight,
        color: rowBg,
      });
    }

    let x = startX;
    for (const col of colDefs) {
      const raw = data[col.key];
      const value = col.align === "right" ? String(raw) : String(raw || "");
      const size = 9;
      const w = font.widthOfTextAtSize(value, size);
      const tx = col.align === "right" ? x + col.width - 5 - w : x + 4;

      page.drawText(value, {
        x: tx,
        y: rowY - 9,
        size,
        font,
        color: textColor,
      });
      x += col.width;
    }

    page.drawLine({
      start: { x: startX, y: rowY - lineHeight + 3 },
      end: { x: startX + tableWidth, y: rowY - lineHeight + 3 },
      thickness: 0.5,
      color: tableBorder,
    });
  };

  drawPageHeader();

  for (const key of orderedWeeks) {
    const items = groupedRows.get(key) || [];
    const summary = summaryByWeek.get(key) || {};
    const rowCount = Math.max(1, items.length) + 2; // + Besetzte + Soll
    const neededHeight = 18 + 18 + rowCount * lineHeight + 10;
    ensureSpace(neededHeight);

    const blockTopY = y;
    page.drawRectangle({
      x: startX,
      y: y - 16,
      width: tableWidth,
      height: 16,
      color: rgb(0.9, 0.95, 1),
      borderColor: tableBorder,
      borderWidth: 1,
    });
    page.drawText(`Week ${key}`, {
      x: startX + 5,
      y: y - 10,
      size: 9,
      font: boldFont,
      color: textColor,
    });
    y -= 20;

    const header = drawBerichtTableHeader({ page, boldFont, startX, y, colDefs });
    y = header.nextY - 2;

    if (items.length === 0) {
      drawDataRow(
        { company: "-", container: 0, planen: 0, total: 0 },
        y,
        rgb(0.97, 0.985, 1),
      );
      y -= lineHeight;
    } else {
      let idx = 0;
      for (const row of items) {
        drawDataRow(
          {
            company: String(row.company_name || ""),
            container: toIntSafe(row.container_count),
            planen: toIntSafe(row.planen_count),
            total: toIntSafe(row.total_count),
          },
          y,
          idx % 2 === 1 ? rgb(0.97, 0.985, 1) : null,
        );
        y -= lineHeight;
        idx += 1;
      }
    }

    drawDataRow(
      {
        company: "Besetzte LKW",
        container: toIntSafe(summary.occupied_container),
        planen: toIntSafe(summary.occupied_planen),
        total: toIntSafe(summary.occupied_total),
      },
      y,
      rgb(0.93, 0.98, 0.93),
    );
    y -= lineHeight;

    drawDataRow(
      {
        company: "Soll",
        container: toIntSafe(summary.soll_container),
        planen: toIntSafe(summary.soll_planen),
        total: toIntSafe(summary.soll_total),
      },
      y,
      rgb(1, 0.96, 0.96),
    );
    y -= lineHeight;

    const blockBottomY = y + 2;
    page.drawRectangle({
      x: startX,
      y: blockBottomY,
      width: tableWidth,
      height: blockTopY - blockBottomY - 16,
      borderColor: tableBorder,
      borderWidth: 1,
      color: rgb(1, 1, 1),
      opacity: 0,
    });
    y -= 8;
  }

  if (orderedWeeks.length === 0) {
    ensureSpace(24);
    page.drawText("No data for selected period.", {
      x: startX,
      y: y - 10,
      size: 10,
      font,
      color: textColor,
    });
  }

  return pdfDoc.save();
}

function buildDataPlanMatrixRows(rows = []) {
  const weekMeta = new Map();
  const trucks = new Map();

  for (const row of rows || []) {
    const weekIdx = toIntSafe(row.week_idx, -1);
    if (weekIdx < 0) continue;

    if (!weekMeta.has(weekIdx)) {
      weekMeta.set(weekIdx, {
        idx: weekIdx,
        iso_year: toIntSafe(row.iso_year, 0),
        iso_week: toIntSafe(row.iso_week, 0),
      });
    }

    const lkwId = String(row.lkw_id || "").trim();
    if (!lkwId) continue;

    if (!trucks.has(lkwId)) {
      trucks.set(lkwId, {
        lkw_id: lkwId,
        lkw_nummer: String(row.lkw_nummer || "").trim(),
        marke_modell: String(row.marke_modell || "").trim(),
      });
    }

    const rec = trucks.get(lkwId);
    rec[`w${weekIdx}`] = String(row.week_value ?? "").trim();
  }

  const weekDefs = Array.from(weekMeta.values())
    .sort((a, b) => a.idx - b.idx)
    .map((w) => ({
      ...w,
      key: `w${w.idx}`,
      label: `${w.iso_year}/W${pad2(w.iso_week)}`,
    }));

  const matrixRows = Array.from(trucks.values())
    .sort((a, b) => String(a.lkw_id || "").localeCompare(String(b.lkw_id || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    }))
    .map((row) => {
      const out = { ...row };
      for (const w of weekDefs) {
        if (typeof out[w.key] !== "string") out[w.key] = "";
      }
      return out;
    });

  return { weekDefs, matrixRows };
}

async function buildDataPlanPdfWithPdfLib({ year, week, userId, rows }) {
  const { weekDefs, matrixRows } = buildDataPlanMatrixRows(rows);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [842, 595]; // A4 landscape
  const margin = 22;
  const rowHeight = 16;
  const textSize = 8;
  const tableMaxWidth = pageSize[0] - (margin * 2);

  const columns = resolveAutoColumns({
    columns: [
      { key: "lkw_id", label: "LKW-ID", width: 58 },
      { key: "lkw_nummer", label: "LKW-Nummer", width: 84 },
      { key: "marke_modell", label: "Marke/Modell", width: 108 },
      ...weekDefs.map((w) => ({
        key: w.key,
        label: w.label,
        width: "auto",
        min_width: 86,
        max_width: 160,
      })),
    ],
    rows: matrixRows,
    font,
    size: textSize,
    maxTableWidth: tableMaxWidth,
  });

  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const tableX = margin;
  const borderColor = rgb(0.74, 0.8, 0.9);
  const headerBg = rgb(0.93, 0.96, 1);
  const oddBg = rgb(0.985, 0.99, 1);
  const textColor = rgb(0.08, 0.14, 0.24);

  const startLabel = weekDefs.length
    ? `${weekDefs[0].iso_year}/W${pad2(weekDefs[0].iso_week)}`
    : `${year}/W${pad2(week)}`;
  const endLabel = weekDefs.length
    ? `${weekDefs[weekDefs.length - 1].iso_year}/W${pad2(weekDefs[weekDefs.length - 1].iso_week)}`
    : startLabel;
  const periodLabel = startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawPageHeader = () => {
    page.drawText(`Data/Plan (LKW Weekly Drivers) ${periodLabel}`, {
      x: margin,
      y,
      size: 13,
      font: boldFont,
      color: textColor,
    });
    y -= 16;
    page.drawText(`Generated: ${new Date().toISOString()} UTC | User: ${userId}`, {
      x: margin,
      y,
      size: 8,
      font,
      color: rgb(0.24, 0.3, 0.4),
    });
    y -= 14;
  };

  const drawHeaderRow = () => {
    page.drawRectangle({
      x: tableX,
      y: y - rowHeight + 2,
      width: tableWidth,
      height: rowHeight,
      color: headerBg,
      borderColor,
      borderWidth: 1,
    });

    let x = tableX;
    for (const col of columns) {
      const label = fitTextToWidth(boldFont, col.label, textSize, col.width - 8);
      page.drawText(label, {
        x: x + 4,
        y: y - 9,
        size: textSize,
        font: boldFont,
        color: textColor,
      });
      x += col.width;
      if (x < tableX + tableWidth - 0.5) {
        page.drawLine({
          start: { x, y: y - rowHeight + 2 },
          end: { x, y: y + 2 },
          thickness: 0.8,
          color: borderColor,
        });
      }
    }
    y -= rowHeight;
  };

  const ensureSpace = (needed) => {
    if (y - needed >= margin) return;
    page = pdfDoc.addPage(pageSize);
    y = page.getHeight() - margin;
    drawPageHeader();
    drawHeaderRow();
  };

  const drawRow = (row, idx) => {
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: tableX,
        y: y - rowHeight + 2,
        width: tableWidth,
        height: rowHeight,
        color: oddBg,
      });
    }

    let x = tableX;
    for (const col of columns) {
      const value = fitTextToWidth(font, safeText(row?.[col.key], ""), textSize, col.width - 8);
      page.drawText(value, {
        x: x + 4,
        y: y - 9,
        size: textSize,
        font,
        color: textColor,
      });
      x += col.width;
      if (x < tableX + tableWidth - 0.5) {
        page.drawLine({
          start: { x, y: y - rowHeight + 2 },
          end: { x, y: y + 2 },
          thickness: 0.5,
          color: borderColor,
        });
      }
    }
    page.drawLine({
      start: { x: tableX, y: y - rowHeight + 2 },
      end: { x: tableX + tableWidth, y: y - rowHeight + 2 },
      thickness: 0.5,
      color: borderColor,
    });
    y -= rowHeight;
  };

  drawPageHeader();
  drawHeaderRow();

  if (!Array.isArray(matrixRows) || matrixRows.length === 0) {
    ensureSpace(20);
    page.drawText("No rows found.", {
      x: margin,
      y: y - 10,
      size: 9,
      font,
      color: textColor,
    });
  } else {
    let idx = 0;
    for (const row of matrixRows) {
      ensureSpace(rowHeight + 2);
      drawRow(row, idx);
      idx += 1;
    }
  }

  return pdfDoc.save();
}

function formatWeekDayLabel(dayIdx, workDateValue) {
  const dayShort = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][toIntSafe(dayIdx, 0)] || `D${toIntSafe(dayIdx, 0) + 1}`;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(workDateValue || ""));
  if (!m) return dayShort;
  return `${dayShort} ${m[3]}.${m[2]}`;
}

function buildDataWeekMatrixRows(rows = []) {
  const dayMeta = new Map();
  const trucks = new Map();

  for (const row of rows || []) {
    const dayIdx = toIntSafe(row.day_idx, -1);
    if (dayIdx < 0 || dayIdx > 6) continue;

    if (!dayMeta.has(dayIdx)) {
      dayMeta.set(dayIdx, {
        idx: dayIdx,
        work_date: String(row.work_date || ""),
      });
    }

    const lkwId = String(row.lkw_id || "").trim();
    if (!lkwId) continue;

    if (!trucks.has(lkwId)) {
      trucks.set(lkwId, {
        lkw_id: lkwId,
        lkw_nummer: String(row.lkw_nummer || "").trim(),
        lkw_typ: String(row.lkw_typ || "").trim(),
      });
    }

    const rec = trucks.get(lkwId);
    rec[`d${dayIdx}`] = String(row.day_value ?? "").trim();
  }

  const dayDefs = Array.from(dayMeta.values())
    .sort((a, b) => a.idx - b.idx)
    .map((d) => ({
      ...d,
      key: `d${d.idx}`,
      label: formatWeekDayLabel(d.idx, d.work_date),
    }));

  const matrixRows = Array.from(trucks.values())
    .sort((a, b) => String(a.lkw_id || "").localeCompare(String(b.lkw_id || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    }))
    .map((row) => {
      const out = { ...row };
      for (const d of dayDefs) {
        if (typeof out[d.key] !== "string") out[d.key] = "";
      }
      return out;
    });

  return { dayDefs, matrixRows };
}

async function buildDataWeekPdfWithPdfLib({ year, week, userId, rows }) {
  const { dayDefs, matrixRows } = buildDataWeekMatrixRows(rows);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [842, 595]; // A4 landscape
  const margin = 22;
  const rowHeight = 16;
  const textSize = 8;
  const tableMaxWidth = pageSize[0] - (margin * 2);

  const columns = resolveAutoColumns({
    columns: [
      { key: "lkw_id", label: "LKW-ID", width: 58 },
      { key: "lkw_nummer", label: "LKW-Nummer", width: 84 },
      { key: "lkw_typ", label: "LKW-Typ", width: 74 },
      ...dayDefs.map((d) => ({
        key: d.key,
        label: d.label,
        width: "auto",
        min_width: 88,
        max_width: 170,
      })),
    ],
    rows: matrixRows,
    font,
    size: textSize,
    maxTableWidth: tableMaxWidth,
  });

  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const tableX = margin;
  const borderColor = rgb(0.74, 0.8, 0.9);
  const headerBg = rgb(0.93, 0.96, 1);
  const oddBg = rgb(0.985, 0.99, 1);
  const textColor = rgb(0.08, 0.14, 0.24);

  const startLabel = dayDefs.length ? dayDefs[0].label : "";
  const endLabel = dayDefs.length ? dayDefs[dayDefs.length - 1].label : "";
  const periodLabel = startLabel && endLabel ? `${startLabel} - ${endLabel}` : `${year}/W${pad2(week)}`;

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawPageHeader = () => {
    page.drawText(`Data (Kalender Daily Drivers) ${year}/W${pad2(week)} | ${periodLabel}`, {
      x: margin,
      y,
      size: 12,
      font: boldFont,
      color: textColor,
    });
    y -= 15;
    page.drawText(`Generated: ${new Date().toISOString()} UTC | User: ${userId}`, {
      x: margin,
      y,
      size: 8,
      font,
      color: rgb(0.24, 0.3, 0.4),
    });
    y -= 14;
  };

  const drawHeaderRow = () => {
    page.drawRectangle({
      x: tableX,
      y: y - rowHeight + 2,
      width: tableWidth,
      height: rowHeight,
      color: headerBg,
      borderColor,
      borderWidth: 1,
    });

    let x = tableX;
    for (const col of columns) {
      const label = fitTextToWidth(boldFont, col.label, textSize, col.width - 8);
      page.drawText(label, {
        x: x + 4,
        y: y - 9,
        size: textSize,
        font: boldFont,
        color: textColor,
      });
      x += col.width;
      if (x < tableX + tableWidth - 0.5) {
        page.drawLine({
          start: { x, y: y - rowHeight + 2 },
          end: { x, y: y + 2 },
          thickness: 0.8,
          color: borderColor,
        });
      }
    }
    y -= rowHeight;
  };

  const ensureSpace = (needHeight) => {
    if (y - needHeight >= margin) return;
    page = pdfDoc.addPage(pageSize);
    y = page.getHeight() - margin;
    drawPageHeader();
    drawHeaderRow();
  };

  const drawRow = (row, idx) => {
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: tableX,
        y: y - rowHeight + 2,
        width: tableWidth,
        height: rowHeight,
        color: oddBg,
      });
    }

    let x = tableX;
    for (const col of columns) {
      const value = fitTextToWidth(font, safeText(row?.[col.key], ""), textSize, col.width - 8);
      page.drawText(value, {
        x: x + 4,
        y: y - 9,
        size: textSize,
        font,
        color: textColor,
      });
      x += col.width;
      if (x < tableX + tableWidth - 0.5) {
        page.drawLine({
          start: { x, y: y - rowHeight + 2 },
          end: { x, y: y + 2 },
          thickness: 0.5,
          color: borderColor,
        });
      }
    }
    page.drawLine({
      start: { x: tableX, y: y - rowHeight + 2 },
      end: { x: tableX + tableWidth, y: y - rowHeight + 2 },
      thickness: 0.5,
      color: borderColor,
    });
    y -= rowHeight;
  };

  drawPageHeader();
  drawHeaderRow();

  if (!Array.isArray(matrixRows) || matrixRows.length === 0) {
    ensureSpace(20);
    page.drawText("No rows found.", {
      x: margin,
      y: y - 10,
      size: 9,
      font,
      color: textColor,
    });
  } else {
    let idx = 0;
    for (const row of matrixRows) {
      ensureSpace(rowHeight + 2);
      drawRow(row, idx);
      idx += 1;
    }
  }

  return pdfDoc.save();
}

function fitTextToWidth(font, text, size, maxWidth) {
  const raw = normalizeAscii(safeText(text, ""));
  if (!raw) return "";
  if (measureTextWidth(font, raw, size) <= maxWidth) return raw;
  let out = raw;
  while (out.length > 1 && measureTextWidth(font, `${out}...`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

function measureTextWidth(font, text, size) {
  const cleaned = normalizeAscii(safeText(text, ""));
  if (!cleaned) return 0;
  try {
    return font.widthOfTextAtSize(cleaned, size);
  } catch {
    return font.widthOfTextAtSize(cleaned.replace(/[^\x20-\x7E]/g, "?"), size);
  }
}

function resolveAutoColumns({ columns, rows, font, size, maxTableWidth }) {
  const resolved = columns.map((col) => {
    const out = { ...col };
    if (!Number.isFinite(Number(out.min_width))) out.min_width = 52;
    if (!Number.isFinite(Number(out.max_width))) out.max_width = 180;
    if (!Number.isFinite(Number(out.width)) || String(out.width).toLowerCase() === "auto") {
      out.width = null;
    } else {
      out.width = Number(out.width);
    }
    return out;
  });

  const sampleRows = Array.isArray(rows) ? rows.slice(0, 800) : [];
  for (const col of resolved) {
    if (Number.isFinite(col.width) && col.width > 0) continue;

    let best = measureTextWidth(font, col.label, size) + 12;
    for (const row of sampleRows) {
      const value = safeText(row?.[col.key], "");
      if (!value) continue;
      const w = measureTextWidth(font, value, size) + 12;
      if (w > best) best = w;
      if (best >= col.max_width) break;
    }

    col.width = Math.min(col.max_width, Math.max(col.min_width, Math.ceil(best)));
  }

  let sumWidth = resolved.reduce((sum, col) => sum + col.width, 0);
  if (sumWidth <= maxTableWidth) return resolved;

  const minTotal = resolved.reduce((sum, col) => sum + col.min_width, 0);
  if (minTotal >= maxTableWidth) {
    const ratio = maxTableWidth / minTotal;
    for (const col of resolved) col.width = Math.max(24, Math.floor(col.min_width * ratio));
    return resolved;
  }

  const extraBudget = maxTableWidth - minTotal;
  const extraNeed = resolved.reduce((sum, col) => sum + Math.max(0, col.width - col.min_width), 0);
  for (const col of resolved) {
    const need = Math.max(0, col.width - col.min_width);
    const extra = extraNeed > 0 ? Math.floor((need * extraBudget) / extraNeed) : 0;
    col.width = col.min_width + extra;
  }

  sumWidth = resolved.reduce((sum, col) => sum + col.width, 0);
  let remainder = maxTableWidth - sumWidth;
  let idx = 0;
  while (remainder > 0 && resolved.length > 0) {
    resolved[idx % resolved.length].width += 1;
    remainder -= 1;
    idx += 1;
  }

  return resolved;
}

function getDockTableSpec(kind) {
  if (kind === "lkw-list") {
    return {
      title: "LKW List",
      subtitle: "Sheet LKW: ID, Nummer, Modell, Typ, Firma, Verkauft, Datum verkauft, Telefonnummer",
      sql: LKW_LIST_SQL,
      columns: [
        { key: "lkw_id", label: "LKW ID", width: 60 },
        { key: "lkw_nummer", label: "LKW-Nummer", width: 78 },
        { key: "marke_modell", label: "Marke/Modell", width: 100 },
        { key: "lkw_typ", label: "LKW-Typ", width: 54 },
        { key: "firma", label: "Firma", width: 70 },
        { key: "verkauft", label: "Verkauft", width: 62 },
        { key: "datum_verkauft", label: "Datum verkauft", width: 84 },
        { key: "telefonnummer", label: "Telefonnummer", width: 102 },
      ],
    };
  }

  if (kind === "drivers-list") {
    return {
      title: "Drivers List",
      subtitle: "Sheet Fahrer: Fahrer-ID, Fahrername, Firma, Telefonnummer, LKW-Typ, Status, Datum entlassen",
      sql: DRIVERS_LIST_SQL,
      columns: [
        { key: "fahrer_id", label: "Fahrer-ID", width: 72 },
        { key: "fahrername", label: "Fahrername", width: 132 },
        { key: "firma", label: "Firma", width: 90 },
        { key: "telefonnummer", label: "Telefonnummer", width: 104 },
        { key: "lkw_typ", label: "LKW-Typ", width: 74 },
        { key: "status", label: "Status", width: 70 },
        { key: "datum_entlassen", label: "Datum entlassen", width: 106 },
      ],
    };
  }

  if (kind === "fuel-cards") {
    return {
      title: "Fuel Cards by LKW",
      subtitle: "Sheet LKW: LKW-ID, LKW-Nummer, Marke/Modell, LKW-Typ, Firma, Telefonnummer, DKV/Shell/Tankpool",
      sql: LKW_LIST_SQL,
      columns: [
        { key: "lkw_id", label: "LKW ID", width: "auto", min_width: 52, max_width: 76 },
        { key: "lkw_nummer", label: "LKW-Nummer", width: "auto", min_width: 78, max_width: 120 },
        { key: "marke_modell", label: "Marke/Modell", width: "auto", min_width: 92, max_width: 172 },
        { key: "lkw_typ", label: "LKW-Typ", width: "auto", min_width: 62, max_width: 96 },
        { key: "firma", label: "Firma", width: "auto", min_width: 72, max_width: 122 },
        { key: "telefonnummer", label: "Telefonnummer", width: "auto", min_width: 98, max_width: 142 },
        { key: "dkv_card", label: "DKV Card", width: "auto", min_width: 66, max_width: 124 },
        { key: "shell_card", label: "Shell Card", width: "auto", min_width: 70, max_width: 124 },
        { key: "tankpool_card", label: "Tankpool Card", width: "auto", min_width: 78, max_width: 136 },
      ],
    };
  }
  return null;
}

async function buildDockPdfWithPdfLib({ kind, rows, userId }) {
  const spec = getDockTableSpec(kind);
  if (!spec) throw new Error(`Unsupported dock kind: ${kind}`);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [842, 595]; // A4 landscape
  const margin = 22;
  const rowHeight = 14;
  const maxTextSize = 8;
  const tableMaxWidth = pageSize[0] - (margin * 2);
  const columns = resolveAutoColumns({
    columns: spec.columns,
    rows,
    font,
    size: maxTextSize,
    maxTableWidth: tableMaxWidth,
  });
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const tableX = margin;

  const borderColor = rgb(0.74, 0.8, 0.9);
  const headerBg = rgb(0.93, 0.96, 1);
  const oddBg = rgb(0.985, 0.99, 1);
  const textColor = rgb(0.08, 0.14, 0.24);

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawPageHeader = () => {
    page.drawText(spec.title, {
      x: margin,
      y,
      size: 13,
      font: boldFont,
      color: textColor,
    });
    y -= 16;
    page.drawText(`${spec.subtitle} | Generated: ${new Date().toISOString()} UTC | User: ${userId}`, {
      x: margin,
      y,
      size: 8,
      font,
      color: rgb(0.24, 0.3, 0.4),
    });
    y -= 14;
  };

  const drawHeaderRow = () => {
    page.drawRectangle({
      x: tableX,
      y: y - rowHeight + 2,
      width: tableWidth,
      height: rowHeight,
      color: headerBg,
      borderColor,
      borderWidth: 1,
    });

    let x = tableX;
    for (const col of columns) {
      const label = fitTextToWidth(boldFont, col.label, maxTextSize, col.width - 8);
      page.drawText(label, {
        x: x + 4,
        y: y - 9,
        size: maxTextSize,
        font: boldFont,
        color: textColor,
      });
      x += col.width;
      if (x < tableX + tableWidth - 0.5) {
        page.drawLine({
          start: { x, y: y - rowHeight + 2 },
          end: { x, y: y + 2 },
          thickness: 0.8,
          color: borderColor,
        });
      }
    }
    y -= rowHeight;
  };

  const ensureSpace = (needed) => {
    if (y - needed >= margin) return;
    page = pdfDoc.addPage(pageSize);
    y = page.getHeight() - margin;
    drawPageHeader();
    drawHeaderRow();
  };

  const drawRow = (row, idx) => {
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: tableX,
        y: y - rowHeight + 2,
        width: tableWidth,
        height: rowHeight,
        color: oddBg,
      });
    }

    let x = tableX;
    for (const col of columns) {
      const value = fitTextToWidth(font, safeText(row?.[col.key], ""), maxTextSize, col.width - 8);
      page.drawText(value, {
        x: x + 4,
        y: y - 9,
        size: maxTextSize,
        font,
        color: textColor,
      });
      x += col.width;
      if (x < tableX + tableWidth - 0.5) {
        page.drawLine({
          start: { x, y: y - rowHeight + 2 },
          end: { x, y: y + 2 },
          thickness: 0.5,
          color: borderColor,
        });
      }
    }
    page.drawLine({
      start: { x: tableX, y: y - rowHeight + 2 },
      end: { x: tableX + tableWidth, y: y - rowHeight + 2 },
      thickness: 0.5,
      color: borderColor,
    });
    y -= rowHeight;
  };

  drawPageHeader();
  drawHeaderRow();

  if (!Array.isArray(rows) || rows.length === 0) {
    ensureSpace(20);
    page.drawText("No rows found.", {
      x: margin,
      y: y - 10,
      size: 9,
      font,
      color: textColor,
    });
  } else {
    let idx = 0;
    for (const row of rows) {
      ensureSpace(rowHeight + 2);
      drawRow(row, idx);
      idx += 1;
    }
  }

  return pdfDoc.save();
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

  return { ok: true, userId };
}

function parseJsonSafe(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function authorizeUserByInitData(initDataRaw, env) {
  const auth = await validateTelegramInitData(initDataRaw, env);
  if (!auth.ok) {
    return { ok: false, status: 403, error: auth.error };
  }

  const dbConnectionString = getDbConnectionString(env);
  if (!dbConnectionString) {
    return { ok: false, status: 500, error: "Database connection is not configured" };
  }

  let allowed = false;
  try {
    allowed = await isUserAllowedInDb(auth.userId, env, dbConnectionString);
  } catch {
    return { ok: false, status: 500, error: "Failed to verify access" };
  }
  if (!allowed) {
    return { ok: false, status: 403, error: "Access denied" };
  }
  return {
    ok: true,
    userId: auth.userId,
    dbConnectionString,
  };
}

async function handleHistory(request, env) {
  const url = new URL(request.url);
  const initDataRaw = url.searchParams.get("initData") || "";
  const authz = await authorizeUserByInitData(initDataRaw, env);
  if (!authz.ok) {
    return json({ ok: false, error: authz.error }, authz.status, { "Cache-Control": "no-store" });
  }

  const limit = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get("limit") || "40", 10) || 40));
  let result;
  try {
    result = await queryNeon(
      authz.dbConnectionString,
      `
        SELECT
          id,
          report_type,
          iso_year,
          iso_week,
          params::text AS params_text,
          status,
          requested_at,
          completed_at,
          duration_ms
        FROM reports_log
        WHERE user_id = $1
          AND status = 'success'
        ORDER BY COALESCE(completed_at, requested_at) DESC
        LIMIT $2
      `,
      [authz.userId, limit],
    );
  } catch (err) {
    return json(
      {
        ok: false,
        error: "Failed to load history",
        details: String(err?.message || err || "unknown error"),
      },
      500,
      { "Cache-Control": "no-store" },
    );
  }

  const items = result.rows.map((row) => {
    const reportType = String(row.report_type || "");
    const params = parseJsonSafe(row.params_text, {});
    const isoYear = toIntSafe(row.iso_year, 0) || null;
    const isoWeek = toIntSafe(row.iso_week, 0) || null;

    let filename = `report_${formatUtcDateStamp(new Date())}.pdf`;
    if (reportType === "bericht" && isoYear && isoWeek) {
      filename = makeBerichtFilename(isoYear, isoWeek);
    } else if (reportType === "data_plan" && isoYear && isoWeek) {
      filename = makeDataPlanFilename(isoYear, isoWeek);
    } else if (reportType === "data_data" && isoYear && isoWeek) {
      filename = makeDataWeekFilename(isoYear, isoWeek);
    } else if (REPORT_TYPE_TO_DOCK_KIND[reportType]) {
      filename = makeDockFilename(REPORT_TYPE_TO_DOCK_KIND[reportType]);
    }

    return {
      id: toIntSafe(row.id, 0),
      report_type: reportType,
      dock_kind: REPORT_TYPE_TO_DOCK_KIND[reportType] || null,
      iso_year: isoYear,
      iso_week: isoWeek,
      requested_at: row.requested_at ? String(row.requested_at) : null,
      completed_at: row.completed_at ? String(row.completed_at) : null,
      duration_ms: toIntSafe(row.duration_ms, 0) || null,
      params,
      filename,
    };
  });

  return json(
    {
      ok: true,
      count: items.length,
      items,
    },
    200,
    { "Cache-Control": "no-store" },
  );
}

async function handleDockPdf(request, env) {
  const url = new URL(request.url);
  const initDataRaw = url.searchParams.get("initData") || "";
  const kind = String(url.searchParams.get("kind") || "").trim();
  const requestedDisposition = String(url.searchParams.get("disposition") || "").toLowerCase();
  const dispositionType = requestedDisposition === "inline" ? "inline" : "attachment";

  const spec = getDockTableSpec(kind);
  if (!spec) {
    return json({ ok: false, error: `Unknown dock kind: ${kind}` }, 400, { "Cache-Control": "no-store" });
  }

  const authz = await authorizeUserByInitData(initDataRaw, env);
  if (!authz.ok) {
    return json({ ok: false, error: authz.error }, authz.status, { "Cache-Control": "no-store" });
  }

  let rows = [];
  try {
    const result = await queryNeon(authz.dbConnectionString, spec.sql, []);
    rows = result.rows || [];
  } catch (err) {
    return json(
      {
        ok: false,
        error: "Failed to load data for PDF",
        details: String(err?.message || err || "unknown error"),
      },
      500,
      { "Cache-Control": "no-store" },
    );
  }

  let pdfBytes;
  const startedMs = Date.now();
  let pdfEngine = "pdf-lib";
  const filename = makeDockFilename(kind);
  try {
    pdfBytes = await buildDockPdfWithPdfLib({
      kind,
      rows,
      userId: authz.userId,
    });
  } catch (err) {
    pdfEngine = "legacy-fallback";
    const lines = [];
    const cols = spec.columns.map((c) => c.key);
    lines.push(spec.columns.map((c) => c.label).join(" | "));
    lines.push("-".repeat(120));
    for (const row of rows.slice(0, 500)) {
      lines.push(cols.map((k) => safeText(row?.[k], "")).join(" | "));
    }
    if (rows.length > 500) {
      lines.push(`... truncated: ${rows.length - 500} more rows`);
    }
    pdfBytes = buildSimplePdf({
      title: spec.title,
      subtitle: `Generated at ${new Date().toISOString()} UTC, user ${authz.userId}`,
      lines,
    });
  }

  try {
    await writeReportLog(authz.dbConnectionString, {
      userId: authz.userId,
      chatId: authz.userId,
      reportType: DOCK_KIND_TO_REPORT_TYPE[kind] || "dock_report",
      status: "success",
      params: { kind, source: "miniapp_dock" },
      durationMs: Date.now() - startedMs,
      outputKey: `${kind}:${formatUtcDateStamp(new Date())}`,
    });
  } catch {
    // logging is best-effort
  }

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${dispositionType}; filename=\"${filename}\"`,
      "Cache-Control": "no-store",
      "X-Report-Type": DOCK_KIND_TO_REPORT_TYPE[kind] || "dock_report",
      "X-Source": "sql-neon",
      "X-PDF-Engine": pdfEngine,
    },
  });
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

  const dbConnectionString = getDbConnectionString(env);
  if (!dbConnectionString) {
    return new Response("Server not configured", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  try {
    const allowed = await isUserAllowedInDb(auth.userId, env, dbConnectionString);
    if (!allowed) {
      return new Response("Forbidden", {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    }
  } catch {
    return new Response("Server error", {
      status: 500,
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

  if (reportType === "bericht" || reportType === "data_plan" || reportType === "data_data") {
    const year = Number.parseInt(String(body.year ?? ""), 10);
    const week = Number.parseInt(String(body.week ?? ""), 10);
    const yearParam = report.params.find((p) => p.id === "year");
    const weekParam = report.params.find((p) => p.id === "week");
    const minYear = toInt(yearParam?.min, 2020);
    const maxYear = toInt(yearParam?.max, 2100);
    const minWeek = toInt(weekParam?.min, 1);
    const maxWeek = toInt(weekParam?.max, 53);
    if (!Number.isFinite(year) || !Number.isFinite(week)) {
      return { ok: false, status: 400, error: "Invalid year/week" };
    }
    if (!(year >= minYear && year <= maxYear && week >= minWeek && week <= maxWeek)) {
      return { ok: false, status: 400, error: "Year/week out of range" };
    }
    return { ok: true, reportType, year, week };
  }

  return { ok: true, reportType };
}

async function handleGenerateWithBody(body, env, enforceRateLimit = true) {
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

  if (valid.reportType !== "bericht" && valid.reportType !== "data_plan" && valid.reportType !== "data_data") {
    return json(
      {
        ok: false,
        error: `Report ${valid.reportType} is not implemented yet`,
        code: "NOT_IMPLEMENTED",
      },
      501,
      { "Cache-Control": "no-store" },
    );
  }

  const dbConnectionString = getDbConnectionString(env);
  if (!dbConnectionString) {
    return json(
      {
        ok: false,
        error: "Database connection is not configured",
        code: "DB_NOT_CONFIGURED",
      },
      500,
      { "Cache-Control": "no-store" },
    );
  }

  let allowed = false;
  try {
    allowed = await isUserAllowedInDb(auth.userId, env, dbConnectionString);
  } catch {
    return json(
      {
        ok: false,
        error: "Failed to verify access",
        code: "ACCESS_CHECK_FAILED",
      },
      500,
      { "Cache-Control": "no-store" },
    );
  }
  if (!allowed) {
    return json(
      {
        ok: false,
        error: "Access denied",
        code: "ACCESS_DENIED",
      },
      403,
      { "Cache-Control": "no-store" },
    );
  }

  if (enforceRateLimit) {
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
  }

  const startedMs = Date.now();
  const requestedDisposition = String(body?.disposition || "").toLowerCase();
  const dispositionType = requestedDisposition === "inline" ? "inline" : "attachment";
  let pdfBytes;
  let pdfEngine = "pdf-lib";
  let filename = `report_${formatUtcDateStamp(new Date())}.pdf`;
  let outputKey = `${valid.reportType}:${valid.year}:W${pad2(valid.week)}`;

  if (valid.reportType === "bericht") {
    let rows;
    let weekSummaries;
    try {
      const [companyResult, summaryResult] = await Promise.all([
        queryNeon(dbConnectionString, BERICHT_COMPANY_SQL, [valid.year, valid.week]),
        queryNeon(dbConnectionString, BERICHT_WEEK_SUMMARY_SQL, [valid.year, valid.week]),
      ]);
      rows = companyResult.rows;
      weekSummaries = summaryResult.rows;
    } catch (err) {
      return json(
        {
          ok: false,
          error: "Failed to execute SQL query",
          code: "SQL_ERROR",
          details: String(err?.message || err || "unknown error"),
        },
        500,
        { "Cache-Control": "no-store" },
      );
    }

    filename = makeBerichtFilename(valid.year, valid.week);
    outputKey = `bericht:${valid.year}:W${pad2(valid.week)}`;
    try {
      pdfBytes = await buildBerichtPdfWithPdfLib({
        year: valid.year,
        week: valid.week,
        userId: auth.userId,
        rows,
        weekSummaries,
      });
    } catch (err) {
      // Keep generation available even if pdf-lib fails on edge runtime.
      pdfEngine = "legacy-fallback";
      const lines = formatBerichtLines(rows, weekSummaries);
      pdfBytes = buildSimplePdf({
        title: `Bericht (Trucks by Company) - ${valid.year}/W${pad2(valid.week)}`,
        subtitle: `Generated at ${new Date().toISOString()} UTC, user ${auth.userId}`,
        lines: [
          `PDF engine fallback activated (${String(err?.message || "unknown")})`,
          "",
          ...lines,
        ],
      });
    }
  } else if (valid.reportType === "data_plan") {
    let rows;
    try {
      const result = await queryNeon(dbConnectionString, DATA_PLAN_GRID_SQL, [valid.year, valid.week]);
      rows = result.rows || [];
    } catch (err) {
      return json(
        {
          ok: false,
          error: "Failed to execute SQL query",
          code: "SQL_ERROR",
          details: String(err?.message || err || "unknown error"),
        },
        500,
        { "Cache-Control": "no-store" },
      );
    }

    filename = makeDataPlanFilename(valid.year, valid.week);
    outputKey = `data_plan:${valid.year}:W${pad2(valid.week)}`;
    try {
      pdfBytes = await buildDataPlanPdfWithPdfLib({
        year: valid.year,
        week: valid.week,
        userId: auth.userId,
        rows,
      });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const { weekDefs, matrixRows } = buildDataPlanMatrixRows(rows);
      const lines = [];
      const headers = ["LKW-ID", "LKW-Nummer", "Marke/Modell", ...weekDefs.map((w) => w.label)];
      lines.push(headers.join(" | "));
      lines.push("-".repeat(160));
      for (const row of matrixRows.slice(0, 500)) {
        const values = [
          safeText(row.lkw_id, ""),
          safeText(row.lkw_nummer, ""),
          safeText(row.marke_modell, ""),
          ...weekDefs.map((w) => safeText(row[w.key], "")),
        ];
        lines.push(values.join(" | "));
      }
      if (matrixRows.length > 500) {
        lines.push(`... truncated: ${matrixRows.length - 500} more rows`);
      }
      pdfBytes = buildSimplePdf({
        title: `Data/Plan - ${valid.year}/W${pad2(valid.week)} (+3 weeks)`,
        subtitle: `Generated at ${new Date().toISOString()} UTC, user ${auth.userId}`,
        lines,
        pageWidth: 842,
        pageHeight: 595,
      });
    }
  } else {
    let rows;
    try {
      const result = await queryNeon(dbConnectionString, DATA_WEEK_GRID_SQL, [valid.year, valid.week]);
      rows = result.rows || [];
    } catch (err) {
      return json(
        {
          ok: false,
          error: "Failed to execute SQL query",
          code: "SQL_ERROR",
          details: String(err?.message || err || "unknown error"),
        },
        500,
        { "Cache-Control": "no-store" },
      );
    }

    filename = makeDataWeekFilename(valid.year, valid.week);
    outputKey = `data_data:${valid.year}:W${pad2(valid.week)}`;
    try {
      pdfBytes = await buildDataWeekPdfWithPdfLib({
        year: valid.year,
        week: valid.week,
        userId: auth.userId,
        rows,
      });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const { dayDefs, matrixRows } = buildDataWeekMatrixRows(rows);
      const lines = [];
      const headers = ["LKW-ID", "LKW-Nummer", "LKW-Typ", ...dayDefs.map((d) => d.label)];
      lines.push(headers.join(" | "));
      lines.push("-".repeat(180));
      for (const row of matrixRows.slice(0, 500)) {
        const values = [
          safeText(row.lkw_id, ""),
          safeText(row.lkw_nummer, ""),
          safeText(row.lkw_typ, ""),
          ...dayDefs.map((d) => safeText(row[d.key], "")),
        ];
        lines.push(values.join(" | "));
      }
      if (matrixRows.length > 500) {
        lines.push(`... truncated: ${matrixRows.length - 500} more rows`);
      }
      pdfBytes = buildSimplePdf({
        title: `Data (Kalender) - ${valid.year}/W${pad2(valid.week)} (7 days)`,
        subtitle: `Generated at ${new Date().toISOString()} UTC, user ${auth.userId}`,
        lines,
        pageWidth: 842,
        pageHeight: 595,
      });
    }
  }

  try {
    await writeReportLog(dbConnectionString, {
      userId: auth.userId,
      chatId: auth.userId,
      reportType: valid.reportType,
      isoYear: valid.year,
      isoWeek: valid.week,
      status: "success",
      params: { year: valid.year, week: valid.week, source: "miniapp_generate", report_type: valid.reportType },
      durationMs: Date.now() - startedMs,
      outputKey,
    });
  } catch {
    // logging is best-effort
  }

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${dispositionType}; filename=\"${filename}\"`,
      "Cache-Control": "no-store",
      "X-Report-Type": valid.reportType,
      "X-Source": "sql-neon",
      "X-PDF-Engine": pdfEngine,
    },
  });
}

async function handleGenerate(request, env) {
  const body = await parseJsonBody(request);
  return handleGenerateWithBody(body, env, true);
}

async function handleGenerateGet(request, env) {
  const url = new URL(request.url);
  const body = {
    initData: url.searchParams.get("initData") || "",
    report_type: url.searchParams.get("report_type") || "",
    year: url.searchParams.get("year"),
    week: url.searchParams.get("week"),
    disposition: url.searchParams.get("disposition") || "",
  };
  return handleGenerateWithBody(body, env, false);
}

async function buildMetaWithAccess(request, env) {
  const meta = buildMeta(env);
  const url = new URL(request.url);

  const dbConnectionString = getDbConnectionString(env);
  if (dbConnectionString) {
    try {
      const staleAfterHours = Math.max(1, toInt(env.ETL_STALE_AFTER_HOURS, 4));
      const staleAfterSec = staleAfterHours * 3600;
      const sourceSpecs = [
        { key: "xlsm_lkw_fahrer_data", file_name: "LKW_Fahrer_Data.xlsm" },
        { key: "xlsb_fahrer_plan", file_name: "LKW_Fahrer_Plan.xlsb" },
      ];
      const sourceMap = Object.fromEntries(
        sourceSpecs.map((spec) => [
          spec.key,
          {
            source_name: spec.key,
            file_name: spec.file_name,
            last_import_at: null,
            age_sec: null,
            is_stale: true,
          },
        ]),
      );

      const result = await queryNeon(
        dbConnectionString,
        `
          SELECT DISTINCT ON (source_name)
            source_name,
            COALESCE(finished_at, started_at) AS import_ts
          FROM etl_log
          WHERE status = 'success'
            AND source_name IN ($1, $2)
          ORDER BY source_name, COALESCE(finished_at, started_at) DESC
        `,
        [sourceSpecs[0].key, sourceSpecs[1].key],
      );

      for (const row of result.rows) {
        const sourceName = String(row.source_name || "").trim();
        if (!sourceName || !sourceMap[sourceName]) continue;
        const parsed = Date.parse(String(row.import_ts || ""));
        if (!Number.isFinite(parsed)) continue;
        const ageSec = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
        sourceMap[sourceName] = {
          ...sourceMap[sourceName],
          last_import_at: new Date(parsed).toISOString(),
          age_sec: ageSec,
          is_stale: ageSec > staleAfterSec,
        };
      }

      const sourceEntries = Object.values(sourceMap);
      const newest = sourceEntries
        .filter((entry) => entry.last_import_at)
        .sort((a, b) => Date.parse(String(b.last_import_at)) - Date.parse(String(a.last_import_at)))[0] || null;
      const isStale = sourceEntries.some((entry) => entry.is_stale);

      meta.etl = {
        last_import_at: newest?.last_import_at || null,
        age_sec: newest?.age_sec ?? null,
        is_stale: isStale,
        stale_after_hours: staleAfterHours,
        source_name: newest?.source_name || null,
        sources: sourceMap,
      };
    } catch {
      // Keep safe fallback metadata from env.
    }
  }

  const initDataRaw = url.searchParams.get("initData") || "";
  if (!initDataRaw) {
    meta.access = { mode: "anonymous", allowed: null };
    return meta;
  }

  const auth = await validateTelegramInitData(initDataRaw, env);
  if (!auth.ok) {
    return {
      ...meta,
      ok: false,
      access: { mode: "telegram", allowed: false, error: auth.error },
    };
  }

  if (!dbConnectionString) {
    return {
      ...meta,
      ok: false,
      access: { mode: "telegram", allowed: false, error: "Database is not configured" },
    };
  }

  try {
    const allowed = await isUserAllowedInDb(auth.userId, env, dbConnectionString);
    return {
      ...meta,
      ok: allowed,
      access: {
        mode: "telegram",
        allowed,
        user_id: auth.userId,
      },
    };
  } catch {
    return {
      ...meta,
      ok: false,
      access: { mode: "telegram", allowed: false, error: "Access check failed" },
    };
  }
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
      const payload = await buildMetaWithAccess(request, env);
      return json(payload, 200, {
        "Cache-Control": "no-store",
      });
    }

    if (request.method === "POST" && url.pathname === "/api/generate") {
      return handleGenerate(request, env);
    }
    
    if (request.method === "GET" && url.pathname === "/api/generate") {
      return handleGenerateGet(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/history") {
      return handleHistory(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/dock-pdf") {
      return handleDockPdf(request, env);
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
