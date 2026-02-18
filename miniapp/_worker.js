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

function toIntSafe(value, fallback = 0) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function pad2(value) {
  return String(value).padStart(2, "0");
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

function buildSimplePdf({ title, subtitle, lines }) {
  const commands = [];
  let y = 810;

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
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
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

  if (valid.reportType !== "bericht") {
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

  const generatedAt = new Date().toISOString();
  const filename = `bericht_${valid.year}_w${pad2(valid.week)}.pdf`;
  let pdfBytes;
  let pdfEngine = "pdf-lib";
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
      subtitle: `Generated at ${generatedAt} UTC, user ${auth.userId}`,
      lines: [
        `PDF engine fallback activated (${String(err?.message || "unknown")})`,
        "",
        ...lines,
      ],
    });
  }

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "no-store",
      "X-Report-Type": "bericht",
      "X-Source": "sql-neon",
      "X-PDF-Engine": pdfEngine,
    },
  });
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
