// Cloudflare Pages Worker (advanced mode) for API routes.
// This file works with direct "Upload assets" deployments.
import { PDFDocument, StandardFonts, degrees, rgb } from "./vendor/pdf-lib.esm.js";

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
    id: "einnahmen",
    enabled: true,
    icon: "money",
    name: {
      en: "Einnahmen (Monthly Revenue)",
      ru: "Einnahmen (выручка по месяцам)",
      de: "Einnahmen (Monatsumsatz)",
    },
    description: {
      en: "Monthly Nahverkehr / Logistics / Gesamt with trend chart",
      ru: "Помесячно: Nahverkehr / Logistics / Gesamt и график динамики",
      de: "Monatlich: Nahverkehr / Logistics / Gesamt mit Trendgrafik",
    },
    params: [],
  },
  {
    id: "einnahmen_firm",
    enabled: true,
    icon: "money",
    name: {
      en: "Einnahmen (Companies by Month)",
      ru: "Einnahmen (оборот фирм по месяцам)",
      de: "Einnahmen (Firmenumsatz pro Monat)",
    },
    description: {
      en: "Top 20 companies from Bericht_Dispo BS:CF with monthly comparison chart",
      ru: "Первые 20 фирм из Bericht_Dispo BS:CF с таблицей и графиком сравнения по месяцам",
      de: "Erste 20 Firmen aus Bericht_Dispo BS:CF mit Tabelle und Monatsvergleichsgrafik",
    },
    params: [],
  },
  {
    id: "diesel",
    enabled: true,
    icon: "fuel",
    name: {
      en: "Diesel (Monthly Fuel Costs)",
      ru: "Diesel (помесячный дизель)",
      de: "Diesel (Monatsverbrauch)",
    },
    description: {
      en: "Two-page Diesel PDF snapshot from the source sheet ranges",
      ru: "Двухстраничный Diesel PDF по диапазонам исходного листа",
      de: "Zweiseitiger Diesel-PDF-Snapshot aus den Quelldatenbereichen",
    },
    params: [],
  },
  {
    id: "diesel_lkw_card",
    enabled: true,
    icon: "fuel",
    name: {
      en: "Diesel (LKW Card)",
      ru: "Diesel (карта LKW)",
      de: "Diesel (LKW Karte)",
    },
    description: {
      en: "Fuel card PDF for one selected LKW from sheet LKW",
      ru: "PDF по топливным картам для одного выбранного LKW из листа LKW",
      de: "Tankkarten-PDF fuer ein ausgewaehltes LKW aus Blatt LKW",
    },
    params: [
      {
        id: "lkw_id",
        type: "text",
        label: { en: "LKW ID", ru: "LKW ID" },
      },
    ],
  },
  {
    id: "yf_driver_month",
    enabled: true,
    icon: "chart",
    name: {
      en: "Yellow Fox (Driver Monthly)",
      ru: "Yellow Fox (водитель за месяц)",
      de: "Yellow Fox (Fahrer pro Monat)",
    },
    description: {
      en: "Monthly driver metrics from sheet YF_Fahrer",
      ru: "Помесячные показатели водителя с листа YF_Fahrer",
      de: "Monatskennzahlen Fahrer aus Blatt YF_Fahrer",
    },
    params: [
      {
        id: "month",
        type: "month",
        label: { en: "Month", ru: "Месяц" },
        min: 1,
        max: 12,
      },
      {
        id: "driver_query",
        type: "text",
        label: { en: "Driver", ru: "Водитель" },
      },
    ],
  },
  {
    id: "yf_lkw_week",
    enabled: true,
    icon: "chart",
    name: {
      en: "Yellow Fox (LKW Weekly)",
      ru: "Yellow Fox (машина за неделю)",
      de: "Yellow Fox (LKW pro Woche)",
    },
    description: {
      en: "Weekly LKW operation metrics from sheet YF",
      ru: "Недельные показатели работы машины с листа YF",
      de: "Wochenkennzahlen LKW aus Blatt YF",
    },
    params: [
      {
        id: "year",
        type: "year",
        label: { en: "Year", ru: "Год" },
        min: 2025,
        max: 2035,
      },
      {
        id: "week",
        type: "week",
        label: { en: "Week", ru: "Неделя" },
        min: 1,
        max: 53,
      },
      {
        id: "lkw_id",
        type: "text",
        label: { en: "LKW", ru: "LKW" },
      },
    ],
  },
  {
    id: "yf_lkw_month",
    enabled: true,
    icon: "chart",
    name: {
      en: "Yellow Fox (LKW Monthly)",
      ru: "Yellow Fox (машина за месяц)",
      de: "Yellow Fox (LKW pro Monat)",
    },
    description: {
      en: "Monthly LKW operation summary from sheet YF",
      ru: "Месячная сводка по работе машины с листа YF",
      de: "Monatliche LKW-Zusammenfassung aus Blatt YF",
    },
    params: [
      {
        id: "year",
        type: "year",
        label: { en: "Year", ru: "Год" },
        min: 2025,
        max: 2035,
      },
      {
        id: "month",
        type: "month",
        label: { en: "Month", ru: "Месяц" },
        min: 1,
        max: 12,
      },
      {
        id: "lkw_id",
        type: "text",
        label: { en: "LKW", ru: "LKW" },
      },
    ],
  },
  {
    id: "bonus",
    enabled: true,
    icon: "bonus",
    name: {
      en: "Bonus (Monthly Driver Bonus)",
      ru: "Bonus (помесячный бонус водителей)",
      de: "Bonus (Monatsbonus Fahrer)",
    },
    description: {
      en: "BonusDynamik by selected year/month with optional Fahrer filter",
      ru: "BonusDynamik за выбранный год/месяц с фильтром по Fahrer",
      de: "BonusDynamik fuer ausgewaehltes Jahr/Monat mit Fahrer-Filter",
    },
    params: [
      {
        id: "year",
        type: "year",
        label: { en: "Year", ru: "Год" },
        min: 2025,
        max: 2035,
      },
      {
        id: "month",
        type: "month",
        label: { en: "Month", ru: "Месяц" },
        min: 1,
        max: 12,
      },
      {
        id: "driver_query",
        type: "text",
        label: { en: "Fahrer ID / Name", ru: "ID / Фамилия Fahrer" },
      },
    ],
  },
  {
    id: "bonus_firma_month",
    enabled: true,
    icon: "bonus",
    name: {
      en: "Bonus (Company by Month)",
      ru: "Bonus (фирма за месяц)",
      de: "Bonus (Firma pro Monat)",
    },
    description: {
      en: "Driver bonus list for one selected company and month with total bonus sum",
      ru: "Список бонусов водителей по выбранной фирме и месяцу с общей суммой бонуса",
      de: "Bonusliste der Fahrer fuer eine ausgewaehlte Firma und einen Monat mit Gesamtsumme",
    },
    params: [
      {
        id: "year",
        type: "year",
        label: { en: "Year", ru: "Год", de: "Jahr" },
        min: 2025,
        max: 2035,
      },
      {
        id: "month",
        type: "month",
        label: { en: "Month", ru: "Месяц", de: "Monat" },
        min: 1,
        max: 12,
      },
      {
        id: "firma_name",
        type: "text",
        label: { en: "Firma", ru: "Фирма", de: "Firma" },
      },
    ],
  },
  {
    id: "lkw_single",
    enabled: true,
    icon: "truck",
    name: {
      en: "LKW (Single Truck)",
      ru: "LKW (одна машина)",
      de: "LKW (ein LKW)",
    },
    description: {
      en: "Detailed master report for one selected LKW from sheet LKW",
      ru: "Детальный мастер-отчет по одному LKW из листа LKW",
      de: "Detaillierter Stammdatenbericht fuer ein LKW aus Blatt LKW",
    },
    params: [
      {
        id: "lkw_id",
        type: "text",
        label: { en: "LKW ID", ru: "LKW ID" },
      },
    ],
  },
  {
    id: "lkw_all",
    enabled: true,
    icon: "truck",
    name: {
      en: "LKW (All Trucks)",
      ru: "LKW (все машины)",
      de: "LKW (alle LKW)",
    },
    description: {
      en: "Master report for all LKW from sheet LKW",
      ru: "Мастер-отчет по всем LKW из листа LKW",
      de: "Stammdatenbericht fuer alle LKW aus Blatt LKW",
    },
    params: [],
  },
  {
    id: "fahrer_all",
    enabled: true,
    icon: "drivers",
    name: {
      en: "Fahrer (All Drivers Data)",
      ru: "Fahrer (данные всех водителей)",
      de: "Fahrer (Daten aller Fahrer)",
    },
    description: {
      en: "All drivers master data with weekly vacation and sick summary from sheet Fahrer",
      ru: "Все водители: мастер-данные и недельная сводка по отпуску и больничному с листа Fahrer",
      de: "Alle Fahrer: Stammdaten sowie Wochenuebersicht zu Urlaub und Krankheit aus Blatt Fahrer",
    },
    params: [],
  },
  {
    id: "fahrer_card",
    enabled: true,
    icon: "drivers",
    name: {
      en: "Fahrer (Driver Card)",
      ru: "Fahrer (карточка водителя)",
      de: "Fahrer (Fahrerkarte)",
    },
    description: {
      en: "Presentation-style PDF card for one driver with master data, vacation/sick weeks, mileage by LKW and monthly bonus",
      ru: "PDF-карточка одного водителя: мастер-данные, отпуск/больничный по неделям, пробег по LKW и бонусы по месяцам",
      de: "Praesentationskarte fuer einen Fahrer mit Stammdaten, Urlaub/Krankheit, KM je LKW und Monatsbonus",
    },
    params: [
      {
        id: "driver_query",
        type: "text",
        label: { en: "Fahrer ID / Name", ru: "ID / имя Fahrer", de: "Fahrer-ID / Name" },
      },
    ],
  },
  {
    id: "fahrer_type",
    enabled: true,
    icon: "drivers",
    name: {
      en: "Fahrer (Container / Planen)",
      ru: "Fahrer (Container / Planen)",
      de: "Fahrer (Container / Planen)",
    },
    description: {
      en: "List of active drivers by Container or Planen from sheet Fahrer",
      ru: "Список активных водителей по Container или Planen из листа Fahrer",
      de: "Liste aktiver Fahrer nach Container oder Planen aus Blatt Fahrer",
    },
    params: [
      {
        id: "lkw_type",
        type: "text",
        label: { en: "Container / Planen", ru: "Container / Planen", de: "Container / Planen" },
      },
    ],
  },
  {
    id: "fahrer_firma",
    enabled: true,
    icon: "drivers",
    name: {
      en: "Fahrer (Firma)",
      ru: "Fahrer (Firma)",
      de: "Fahrer (Firma)",
    },
    description: {
      en: "List of active drivers for one selected company from sheet Fahrer",
      ru: "Список активных водителей по выбранной фирме из листа Fahrer",
      de: "Liste aktiver Fahrer fuer eine ausgewaehlte Firma aus Blatt Fahrer",
    },
    params: [
      {
        id: "firma_name",
        type: "text",
        label: { en: "Firma", ru: "Firma", de: "Firma" },
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

const EINNAHMEN_MONTHLY_SQL = `
SELECT
  month_index,
  month_name,
  COALESCE(nahverkehr, 0)::numeric AS nahverkehr,
  COALESCE(logistics, 0)::numeric AS logistics,
  COALESCE(gesamt, 0)::numeric AS gesamt
FROM report_einnahmen_monthly
ORDER BY month_index;
`;

const EINNAHMEN_FIRM_SQL = `
SELECT
  row_index,
  firm_name,
  COALESCE(january, 0)::numeric AS january,
  COALESCE(february, 0)::numeric AS february,
  COALESCE(march, 0)::numeric AS march,
  COALESCE(april, 0)::numeric AS april,
  COALESCE(may, 0)::numeric AS may,
  COALESCE(june, 0)::numeric AS june,
  COALESCE(july, 0)::numeric AS july,
  COALESCE(august, 0)::numeric AS august,
  COALESCE(september, 0)::numeric AS september,
  COALESCE(october, 0)::numeric AS october,
  COALESCE(november, 0)::numeric AS november,
  COALESCE(december, 0)::numeric AS december,
  COALESCE(total, 0)::numeric AS total
FROM report_einnahmen_firm_monthly
ORDER BY row_index;
`;

const DIESEL_MONTHLY_SQL = `
SELECT
  report_year,
  month_index,
  month_name,
  raw_payload
FROM report_diesel_monthly
ORDER BY report_year, month_index;
`;

const BONUS_MONTHLY_SQL = `
SELECT
  report_year,
  report_month,
  month_start,
  fahrer_id,
  fahrer_name,
  COALESCE(days, 0)::numeric AS days,
  COALESCE(km, 0)::numeric AS km,
  COALESCE(pct_km, 0)::numeric AS pct_km,
  COALESCE(ct, 0)::numeric AS ct,
  COALESCE(pct_ct, 0)::numeric AS pct_ct,
  COALESCE(bonus, 0)::numeric AS bonus,
  COALESCE(penalty, 0)::numeric AS penalty,
  COALESCE(final, 0)::numeric AS final
FROM report_bonus_dynamik_monthly
WHERE report_year = $1::int
  AND report_month = $2::int
  AND (
    $3::text = ''
    OR lower(fahrer_id) = lower($3::text)
    OR lower(fahrer_id) LIKE lower($4::text)
    OR lower(fahrer_name) LIKE lower($4::text)
  )
ORDER BY final DESC, fahrer_name ASC, fahrer_id ASC;
`;

const BONUS_YEARLY_SQL = `
SELECT
  report_year,
  report_month,
  month_start,
  fahrer_id,
  fahrer_name,
  COALESCE(days, 0)::numeric AS days,
  COALESCE(km, 0)::numeric AS km,
  COALESCE(pct_km, 0)::numeric AS pct_km,
  COALESCE(ct, 0)::numeric AS ct,
  COALESCE(pct_ct, 0)::numeric AS pct_ct,
  COALESCE(bonus, 0)::numeric AS bonus,
  COALESCE(penalty, 0)::numeric AS penalty,
  COALESCE(final, 0)::numeric AS final
FROM report_bonus_dynamik_monthly
WHERE report_year = $1::int
  AND (
    $2::text = ''
    OR lower(fahrer_id) = lower($2::text)
    OR lower(fahrer_id) LIKE lower($3::text)
    OR lower(fahrer_name) LIKE lower($3::text)
  )
ORDER BY fahrer_name ASC, fahrer_id ASC, report_month ASC;
`;

const BONUS_FIRMA_MONTHLY_SQL = `
SELECT
  b.report_year,
  b.report_month,
  b.month_start,
  b.fahrer_id,
  b.fahrer_name,
  COALESCE(b.days, 0)::numeric AS days,
  COALESCE(b.km, 0)::numeric AS km,
  COALESCE(b.pct_km, 0)::numeric AS pct_km,
  COALESCE(b.ct, 0)::numeric AS ct,
  COALESCE(b.pct_ct, 0)::numeric AS pct_ct,
  COALESCE(b.bonus, 0)::numeric AS bonus,
  COALESCE(b.penalty, 0)::numeric AS penalty,
  COALESCE(b.final, 0)::numeric AS final
FROM report_bonus_dynamik_monthly b
LEFT JOIN drivers d ON lower(d.external_id) = lower(b.fahrer_id)
LEFT JOIN companies c ON c.id = d.company_id
WHERE b.report_year = $1::int
  AND b.report_month = $2::int
  AND lower(trim(COALESCE(NULLIF(c.name, ''), NULLIF(d.raw_payload->>'Firma', ''), NULLIF(d.raw_payload->>'Company', ''), ''))) = lower(trim($3::text))
ORDER BY b.final DESC, b.fahrer_name ASC, b.fahrer_id ASC;
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

const LKW_MASTER_SQL = `
SELECT
  t.external_id AS lkw_id,
  COALESCE(NULLIF(t.plate_number, ''), NULLIF(t.raw_payload->>'LKW-Nummer', ''), NULLIF(t.raw_payload->>'Number', '')) AS lkw_nummer,
  COALESCE(NULLIF(t.raw_payload->>'Marke/Modell', ''), NULLIF(t.raw_payload->>'Brand/Model', '')) AS marke_modell,
  COALESCE(NULLIF(t.truck_type, ''), NULLIF(t.raw_payload->>'LKW-Typ', ''), NULLIF(t.raw_payload->>'Type', '')) AS lkw_typ,
  COALESCE(NULLIF(t.raw_payload->>'Baujahr', ''), NULLIF(t.raw_payload->>'Year', '')) AS baujahr,
  COALESCE(NULLIF(c.name, ''), NULLIF(t.raw_payload->>'Firma', ''), NULLIF(t.raw_payload->>'Company', '')) AS firma,
  COALESCE(NULLIF(t.raw_payload->>'Eigentum', ''), NULLIF(t.raw_payload->>'Ownership', '')) AS eigentum,
  COALESCE(NULLIF(t.status, ''), NULLIF(t.raw_payload->>'Status', '')) AS status,
  COALESCE(to_char(t.status_since, 'DD/MM/YYYY'), NULLIF(t.raw_payload->>'Datum verkauft', ''), NULLIF(t.raw_payload->>'Sale Date', '')) AS datum_verkauft,
  COALESCE(NULLIF(t.raw_payload->>'Telefonnummer', ''), NULLIF(t.raw_payload->>'Phone Number', ''), NULLIF(t.raw_payload->>'Phone', '')) AS telefonnummer,
  COALESCE(NULLIF(t.raw_payload->>'DKV Card', ''), NULLIF(t.raw_payload->>'DKV', '')) AS dkv_card,
  COALESCE(NULLIF(t.raw_payload->>'Shell Card', ''), NULLIF(t.raw_payload->>'Shell', '')) AS shell_card,
  COALESCE(NULLIF(t.raw_payload->>'Tankpool Card', ''), NULLIF(t.raw_payload->>'Tankpool', '')) AS tankpool_card,
  COALESCE(NULLIF(t.raw_payload->>'KM\n2025', ''), NULLIF(t.raw_payload->>'KM 2025', ''), NULLIF(t.raw_payload->>'KM2025', '')) AS km_2025,
  COALESCE(NULLIF(t.raw_payload->>'KM\n2026', ''), NULLIF(t.raw_payload->>'KM 2026', ''), NULLIF(t.raw_payload->>'KM2026', '')) AS km_2026,
  COALESCE(NULLIF(t.raw_payload->>'Nächste TÜV', ''), NULLIF(t.raw_payload->>'Naechste TUEV', ''), NULLIF(t.raw_payload->>'Nest TÜV', '')) AS naechste_tuev,
  COALESCE(NULLIF(t.raw_payload->>'Versicherung bis', ''), NULLIF(t.raw_payload->>'Insurance', '')) AS versicherung_bis,
  COALESCE(NULLIF(t.raw_payload->>'Gesamtkosten für die Wartung', ''), NULLIF(t.raw_payload->>'Gesamtkosten fur die Wartung', ''), NULLIF(t.raw_payload->>'Total Costs', '')) AS wartung_total,
  COALESCE(NULLIF(t.raw_payload->>'2023', ''), '0') AS cost_2023,
  COALESCE(NULLIF(t.raw_payload->>'2024', ''), '0') AS cost_2024,
  COALESCE(NULLIF(t.raw_payload->>'2025', ''), '0') AS cost_2025,
  COALESCE(NULLIF(t.raw_payload->>'2026', ''), '0') AS cost_2026
FROM trucks t
LEFT JOIN companies c ON c.id = t.company_id
WHERE (
  $1::text = ''
  OR lower(t.external_id) = lower($1::text)
)
ORDER BY t.external_id;
`;

const DIESEL_LKW_CARD_SQL = `
SELECT
  t.external_id AS lkw_id,
  COALESCE(NULLIF(t.plate_number, ''), NULLIF(t.raw_payload->>'LKW-Nummer', ''), NULLIF(t.raw_payload->>'Number', '')) AS lkw_nummer,
  COALESCE(NULLIF(t.raw_payload->>'DKV Card', ''), NULLIF(t.raw_payload->>'DKV', ''), '0') AS dkv_card,
  COALESCE(NULLIF(t.raw_payload->>'Shell Card', ''), NULLIF(t.raw_payload->>'Shell', ''), '0') AS shell_card,
  COALESCE(NULLIF(t.raw_payload->>'Tankpool Card', ''), NULLIF(t.raw_payload->>'Tankpool', ''), '0') AS tankpool_card
FROM trucks t
WHERE lower(t.external_id) = lower($1::text)
ORDER BY t.external_id
LIMIT 1;
`;

const YF_DRIVER_MONTH_SQL = `
SELECT
  month_index,
  fahrer_name,
  distanz_km,
  aktivitaet_total_minutes,
  fahrzeit_total_minutes,
  inaktivitaet_total_minutes
FROM report_yf_fahrer_monthly
WHERE month_index = $1::int
  AND (
    $2::text = ''
    OR regexp_replace(lower(trim(fahrer_name)), '\s+', ' ', 'g') = regexp_replace(lower(trim($2::text)), '\s+', ' ', 'g')
    OR regexp_replace(lower(trim(fahrer_name)), '\s+', ' ', 'g') LIKE regexp_replace(lower(trim($3::text)), '\s+', ' ', 'g')
  )
ORDER BY fahrer_name ASC;
`;

const YF_LKW_WEEK_SQL = `
SELECT
  report_year,
  month_index,
  month_name,
  iso_week,
  lkw_nummer,
  to_char(report_date, 'DD/MM/YYYY') AS report_date,
  dayweek,
  strecke_km,
  km_start,
  km_end,
  drivers_final
FROM report_yf_lkw_daily
WHERE report_year = $1::int
  AND iso_week = $2::int
  AND (
    $3::text = ''
    OR lower(replace(trim(lkw_nummer), ' ', '')) = lower(replace(trim($3::text), ' ', ''))
  )
ORDER BY report_date ASC, source_row ASC, lkw_nummer ASC;
`;

const YF_LKW_MONTH_SQL = `
WITH params AS (
  SELECT
    make_date($1::int, $2::int, 1) AS month_start,
    (make_date($1::int, $2::int, 1) + interval '1 month - 1 day')::date AS month_end,
    lower(replace(trim($3::text), ' ', '')) AS lkw_norm,
    trim($3::text) AS lkw_raw
),
calendar AS (
  SELECT gs::date AS report_date
  FROM params p
  CROSS JOIN generate_series(p.month_start, p.month_end, interval '1 day') AS gs
),
daily AS (
  SELECT
    y.report_date::date AS report_date,
    max(NULLIF(trim(y.lkw_nummer), '')) AS lkw_nummer,
    max(NULLIF(trim(y.dayweek), '')) AS dayweek,
    sum(COALESCE(y.strecke_km, 0))::numeric AS strecke_km,
    min(COALESCE(y.km_start, 0))::numeric AS km_start,
    max(COALESCE(y.km_end, 0))::numeric AS km_end,
    string_agg(
      DISTINCT NULLIF(trim(y.drivers_final), ''),
      ' / '
      ORDER BY NULLIF(trim(y.drivers_final), '')
    ) AS drivers_final,
    count(*)::int AS source_rows
  FROM report_yf_lkw_daily y
  CROSS JOIN params p
  WHERE y.report_date BETWEEN p.month_start AND p.month_end
    AND lower(replace(trim(y.lkw_nummer), ' ', '')) = p.lkw_norm
  GROUP BY y.report_date::date
)
SELECT
  $1::int AS report_year,
  $2::int AS month_index,
  COALESCE(d.lkw_nummer, p.lkw_raw) AS lkw_nummer,
  to_char(c.report_date, 'DD/MM/YYYY') AS report_date,
  COALESCE(d.dayweek, trim(to_char(c.report_date, 'FMDay'))) AS dayweek,
  CASE WHEN extract(isodow FROM c.report_date) IN (6, 7) THEN true ELSE false END AS is_weekend,
  COALESCE(d.strecke_km, 0)::numeric AS strecke_km,
  COALESCE(d.km_start, 0)::numeric AS km_start,
  COALESCE(d.km_end, 0)::numeric AS km_end,
  COALESCE(d.drivers_final, '') AS drivers_final,
  COALESCE(d.source_rows, 0)::int AS source_rows
FROM calendar c
CROSS JOIN params p
LEFT JOIN daily d ON d.report_date = c.report_date
ORDER BY c.report_date ASC;
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

const FAHRER_TYPE_LIST_SQL = `
SELECT
  d.external_id AS fahrer_id,
  d.full_name AS fahrername,
  COALESCE(NULLIF(c.name, ''), NULLIF(d.raw_payload->>'Firma', ''), NULLIF(d.raw_payload->>'Company', '')) AS firma,
  COALESCE(NULLIF(d.phone, ''), NULLIF(d.raw_payload->>'Telefonnummer', ''), NULLIF(d.raw_payload->>'Phone', '')) AS telefonnummer,
  COALESCE(NULLIF(d.raw_payload->>'LKW-Typ', ''), NULLIF(d.raw_payload->>'Type', '')) AS lkw_typ
FROM drivers d
LEFT JOIN companies c ON c.id = d.company_id
WHERE COALESCE(d.is_active, true)
  AND lower(trim(COALESCE(NULLIF(d.raw_payload->>'LKW-Typ', ''), NULLIF(d.raw_payload->>'Type', ''), ''))) = lower(trim($1::text))
ORDER BY d.external_id;
`;

const FAHRER_FIRMA_LIST_SQL = `
SELECT
  d.external_id AS fahrer_id,
  d.full_name AS fahrername,
  COALESCE(NULLIF(c.name, ''), NULLIF(d.raw_payload->>'Firma', ''), NULLIF(d.raw_payload->>'Company', '')) AS firma,
  COALESCE(NULLIF(d.phone, ''), NULLIF(d.raw_payload->>'Telefonnummer', ''), NULLIF(d.raw_payload->>'Phone', '')) AS telefonnummer,
  COALESCE(NULLIF(d.raw_payload->>'LKW-Typ', ''), NULLIF(d.raw_payload->>'Type', '')) AS lkw_typ
FROM drivers d
LEFT JOIN companies c ON c.id = d.company_id
WHERE COALESCE(d.is_active, true)
  AND lower(trim(COALESCE(NULLIF(c.name, ''), NULLIF(d.raw_payload->>'Firma', ''), NULLIF(d.raw_payload->>'Company', ''), ''))) = lower(trim($1::text))
ORDER BY d.external_id;
`;

const FAHRER_ALL_SQL = `
WITH report_year_ref AS (
  SELECT COALESCE(MAX(report_year), EXTRACT(ISOYEAR FROM CURRENT_DATE)::int) AS report_year
  FROM report_fahrer_weekly_status
)
SELECT
  r.report_year,
  d.external_id AS fahrer_id,
  d.full_name AS fahrername,
  COALESCE(NULLIF(c.name, ''), NULLIF(d.raw_payload->>'Firma', ''), NULLIF(d.raw_payload->>'Company', '')) AS firma,
  COALESCE(NULLIF(d.phone, ''), NULLIF(d.raw_payload->>'Telefonnummer', ''), NULLIF(d.raw_payload->>'Phone', '')) AS telefonnummer,
  COALESCE(NULLIF(d.raw_payload->>'LKW-Typ', ''), NULLIF(d.raw_payload->>'Type', '')) AS lkw_typ,
  COALESCE(NULLIF(d.raw_payload->>'Arbeitsplan', ''), NULLIF(d.raw_payload->>'Schedule', '')) AS arbeitsplan,
  COALESCE(NULLIF(d.raw_payload->>'Status', ''), NULLIF(d.raw_payload->>'Active/Fired', '')) AS status_entlassen,
  COALESCE(NULLIF(d.raw_payload->>'Datum entlassen', ''), NULLIF(d.raw_payload->>'Date', '')) AS datum_entlassen,
  COALESCE(NULLIF(d.raw_payload->>('Urlaub gesamt ' || r.report_year::text), ''), NULLIF(d.raw_payload->>'Urlaub gesamt', ''), NULLIF(d.raw_payload->>'Total vacation', ''), '0') AS urlaub_gesamt,
  COALESCE(NULLIF(d.raw_payload->>('Krankheitstage ' || r.report_year::text), ''), NULLIF(d.raw_payload->>'Krankheitstage', ''), NULLIF(d.raw_payload->>'Sick Days', ''), '0') AS krankheitstage
FROM drivers d
CROSS JOIN report_year_ref r
LEFT JOIN companies c ON c.id = d.company_id
ORDER BY d.external_id;
`;

const FAHRER_WEEKLY_STATUS_SQL = `
WITH report_year_ref AS (
  SELECT COALESCE(MAX(report_year), EXTRACT(ISOYEAR FROM CURRENT_DATE)::int) AS report_year
  FROM report_fahrer_weekly_status
)
SELECT
  s.report_year,
  s.iso_week,
  to_char(s.week_start, 'DD/MM/YYYY') AS week_start,
  to_char(s.week_end, 'DD/MM/YYYY') AS week_end,
  s.fahrer_id,
  s.fahrer_name,
  COALESCE(s.company_name, '') AS company_name,
  COALESCE(s.status_entlassen, '') AS status_entlassen,
  to_char(s.datum_entlassen, 'DD/MM/YYYY') AS datum_entlassen,
  COALESCE(s.week_code, '') AS week_code,
  s.is_active_in_week
FROM report_fahrer_weekly_status s
JOIN report_year_ref r ON r.report_year = s.report_year
ORDER BY s.fahrer_id, s.iso_week;
`;

const FAHRER_WEEKLY_SUMMARY_SQL = `
WITH report_year_ref AS (
  SELECT COALESCE(MAX(report_year), EXTRACT(ISOYEAR FROM CURRENT_DATE)::int) AS report_year
  FROM report_fahrer_weekly_status
)
SELECT
  s.report_year,
  s.iso_week,
  to_char(s.week_start, 'DD/MM/YYYY') AS week_start,
  to_char(s.week_end, 'DD/MM/YYYY') AS week_end,
  COUNT(*) FILTER (WHERE s.is_active_in_week)::int AS total_drivers,
  COUNT(*) FILTER (WHERE s.is_active_in_week AND upper(COALESCE(s.week_code, '')) = 'U')::int AS vacation_drivers,
  COUNT(*) FILTER (WHERE s.is_active_in_week AND upper(replace(COALESCE(s.week_code, ''), 'К', 'K')) = 'K')::int AS sick_drivers
FROM report_fahrer_weekly_status s
JOIN report_year_ref r ON r.report_year = s.report_year
GROUP BY s.report_year, s.iso_week, s.week_start, s.week_end
ORDER BY s.iso_week;
`;

const FAHRER_CARD_MASTER_SQL = `
WITH report_year_ref AS (
  SELECT COALESCE(MAX(report_year), EXTRACT(ISOYEAR FROM CURRENT_DATE)::int) AS report_year
  FROM report_fahrer_weekly_status
)
SELECT
  r.report_year,
  d.external_id AS fahrer_id,
  d.full_name AS fahrername,
  COALESCE(NULLIF(c.name, ''), NULLIF(d.raw_payload->>'Firma', ''), NULLIF(d.raw_payload->>'Company', '')) AS firma,
  COALESCE(NULLIF(d.phone, ''), NULLIF(d.raw_payload->>'Telefonnummer', ''), NULLIF(d.raw_payload->>'Phone', '')) AS telefonnummer,
  COALESCE(NULLIF(d.raw_payload->>'Führerschein', ''), NULLIF(d.raw_payload->>'License', '')) AS fuehrerschein,
  COALESCE(NULLIF(d.raw_payload->>'LKW-Typ', ''), NULLIF(d.raw_payload->>'Type', '')) AS lkw_typ,
  COALESCE(NULLIF(d.raw_payload->>'Arbeitsplan', ''), NULLIF(d.raw_payload->>'Schedule', '')) AS arbeitsplan,
  COALESCE(NULLIF(d.raw_payload->>'Status', ''), NULLIF(d.raw_payload->>'Active/Fired', ''), CASE WHEN d.is_active THEN 'Aktiv' ELSE 'Entlassen' END) AS status_entlassen,
  COALESCE(NULLIF(d.raw_payload->>'Datum entlassen', ''), NULLIF(d.raw_payload->>'Date', '')) AS datum_entlassen,
  COALESCE(NULLIF(d.raw_payload->>'Pass gültig bis', ''), NULLIF(d.raw_payload->>'Pass gueltig bis', '')) AS pass_gueltig_bis,
  COALESCE(NULLIF(d.raw_payload->>'95 Code\nrosa Papier bis', ''), NULLIF(d.raw_payload->>'95 Code rosa Papier bis', '')) AS code_95_bis,
  COALESCE(NULLIF(d.raw_payload->>'Art der Wohnungen bis', ''), NULLIF(d.raw_payload->>'Type of residence', '')) AS wohnungen_bis,
  COALESCE(NULLIF(d.raw_payload->>'Eintrittsdatum', ''), NULLIF(d.raw_payload->>'Entry Date', '')) AS eintrittsdatum,
  COALESCE(NULLIF(d.raw_payload->>'Gesundheitsbuch\nbis', ''), NULLIF(d.raw_payload->>'Gesundheitsbuch bis', ''), NULLIF(d.raw_payload->>'Health book', '')) AS gesundheitsbuch_bis,
  COALESCE(NULLIF(d.raw_payload->>'ESDK\nVersicherung bis', ''), NULLIF(d.raw_payload->>'ESDK Versicherung bis', ''), NULLIF(d.raw_payload->>'ESDK / insurance up to', '')) AS esdk_bis,
  COALESCE(NULLIF(d.raw_payload->>'A1 Formular gültig bis', ''), NULLIF(d.raw_payload->>'A1 Form valid until', '')) AS a1_bis,
  COALESCE(NULLIF(d.raw_payload->>'DE  Anhang gültig bis', ''), NULLIF(d.raw_payload->>'DE Anhang gültig bis', ''), NULLIF(d.raw_payload->>'DE application valid', '')) AS de_anhang_bis,
  COALESCE(NULLIF(d.raw_payload->>'28 Tage Besstellung Gültig bis', ''), NULLIF(d.raw_payload->>'28 Day order valid', '')) AS bestellung_28_tage_bis,
  COALESCE(NULLIF(d.raw_payload->>'IMIS', ''), '') AS imis,
  COALESCE(NULLIF(d.raw_payload->>'Geburtsdatum', ''), NULLIF(d.raw_payload->>'Birth Date', '')) AS geburtsdatum,
  COALESCE(NULLIF(d.raw_payload->>'ADR-Schein', ''), NULLIF(d.raw_payload->>'ADR', '')) AS adr_schein,
  COALESCE(NULLIF(d.raw_payload->>'ADR gültig bis', ''), NULLIF(d.raw_payload->>'ADR valid', '')) AS adr_bis,
  COALESCE(NULLIF(d.raw_payload->>'FS gültig bis', ''), NULLIF(d.raw_payload->>'License valid', '')) AS fs_bis,
  COALESCE(NULLIF(d.raw_payload->>('Urlaub gesamt ' || r.report_year::text), ''), NULLIF(d.raw_payload->>'Urlaub gesamt', ''), NULLIF(d.raw_payload->>'Total vacation', ''), '0') AS urlaub_gesamt,
  COALESCE(NULLIF(d.raw_payload->>('Krankheitstage ' || r.report_year::text), ''), NULLIF(d.raw_payload->>'Krankheitstage', ''), NULLIF(d.raw_payload->>'Sick Days', ''), '0') AS krankheitstage
FROM drivers d
CROSS JOIN report_year_ref r
LEFT JOIN companies c ON c.id = d.company_id
WHERE
  lower(d.external_id) = lower($1::text)
  OR lower(d.full_name) = lower($1::text)
  OR lower(d.external_id) LIKE lower($2::text)
  OR lower(d.full_name) LIKE lower($2::text)
ORDER BY
  CASE
    WHEN lower(d.external_id) = lower($1::text) THEN 0
    WHEN lower(d.full_name) = lower($1::text) THEN 1
    ELSE 2
  END,
  d.external_id
LIMIT 1;
`;

const FAHRER_CARD_WEEKLY_SQL = `
WITH report_year_ref AS (
  SELECT COALESCE(MAX(report_year), EXTRACT(ISOYEAR FROM CURRENT_DATE)::int) AS report_year
  FROM report_fahrer_weekly_status
)
SELECT
  s.report_year,
  s.iso_week,
  to_char(s.week_start, 'DD/MM/YYYY') AS week_start,
  to_char(s.week_end, 'DD/MM/YYYY') AS week_end,
  s.fahrer_id,
  s.fahrer_name,
  COALESCE(s.week_code, '') AS week_code,
  s.is_active_in_week
FROM report_fahrer_weekly_status s
JOIN report_year_ref r ON r.report_year = s.report_year
WHERE lower(s.fahrer_id) = lower($1::text)
ORDER BY s.iso_week;
`;

const FAHRER_CARD_MONTHLY_ACTIVITY_SQL = `
WITH activity AS (
  SELECT
    y.report_year,
    y.month_index,
    MAX(y.month_name) AS month_name,
    string_agg(DISTINCT NULLIF(trim(y.lkw_nummer), ''), ' / ' ORDER BY NULLIF(trim(y.lkw_nummer), '')) AS lkw_list,
    SUM(COALESCE(y.strecke_km, 0))::numeric AS km
  FROM report_yf_lkw_daily y
  WHERE regexp_replace(lower(trim(COALESCE(y.drivers_final, ''))), '\\s+', ' ', 'g')
    LIKE '%' || regexp_replace(lower(trim($2::text)), '\\s+', ' ', 'g') || '%'
  GROUP BY y.report_year, y.month_index
), bonus AS (
  SELECT
    report_year,
    report_month AS month_index,
    SUM(COALESCE(days, 0))::int AS days,
    SUM(COALESCE(km, 0))::numeric AS bonus_km,
    SUM(COALESCE(ct, 0))::int AS ct,
    SUM(COALESCE(bonus, 0))::numeric AS bonus,
    SUM(COALESCE(penalty, 0))::numeric AS penalty,
    SUM(COALESCE(final, 0))::numeric AS final
  FROM report_bonus_dynamik_monthly
  WHERE lower(fahrer_id) = lower($1::text)
     OR regexp_replace(lower(trim(fahrer_name)), '\\s+', ' ', 'g') = regexp_replace(lower(trim($2::text)), '\\s+', ' ', 'g')
  GROUP BY report_year, report_month
)
SELECT
  COALESCE(a.report_year, b.report_year) AS report_year,
  COALESCE(a.month_index, b.month_index) AS month_index,
  COALESCE(a.month_name, to_char(make_date(COALESCE(a.report_year, b.report_year)::int, COALESCE(a.month_index, b.month_index)::int, 1), 'FMMonth')) AS month_name,
  COALESCE(a.lkw_list, '') AS lkw_list,
  COALESCE(a.km, 0)::numeric AS km,
  COALESCE(b.days, 0)::int AS days,
  COALESCE(b.bonus_km, 0)::numeric AS bonus_km,
  COALESCE(b.ct, 0)::int AS ct,
  COALESCE(b.bonus, 0)::numeric AS bonus,
  COALESCE(b.penalty, 0)::numeric AS penalty,
  COALESCE(b.final, 0)::numeric AS final
FROM activity a
FULL OUTER JOIN bonus b
  ON b.report_year = a.report_year
 AND b.month_index = a.month_index
ORDER BY report_year, month_index;
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

function formatReportUserLabel(user, fallbackUserId) {
  const firstName = String(user?.first_name || "").trim();
  const lastName = String(user?.last_name || "").trim();
  const fullName = `${lastName} ${firstName}`.trim();
  if (fullName) return fullName;

  const username = String(user?.username || "").replace(/^@+/, "").trim();
  if (username) return username;

  return String(fallbackUserId || "").trim() || "Unknown user";
}

function formatReportGeneratedLabel(userLabel, date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const datePart = `${map.day}/${map.month}/${map.year}`;
  const timePart = `${map.hour}:${map.minute}`;
  const author = String(userLabel || "").trim() || "Unknown user";
  return `Generated ${datePart} ${timePart} | ${author}`;
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

function makeEinnahmenFilename(at = new Date()) {
  return `einnahmen_${formatUtcDateStamp(at)}.pdf`;
}

function makeEinnahmenFirmFilename(at = new Date()) {
  return `einnahmen_firms_${formatUtcDateStamp(at)}.pdf`;
}

function makeDieselFilename(at = new Date()) {
  return `diesel_${formatUtcDateStamp(at)}.pdf`;
}

function makeDieselLkwCardFilename(lkwId, at = new Date()) {
  const clean = String(lkwId || "").trim();
  if (clean) return `diesel_lkw_card_${clean}.pdf`;
  return `diesel_lkw_card_${formatUtcDateStamp(at)}.pdf`;
}

function sanitizeFilenamePart(value) {
  return String(value || "")
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function makeYfDriverMonthFilename(month, driverQuery, at = new Date()) {
  const m = Number.parseInt(String(month), 10);
  const driver = sanitizeFilenamePart(driverQuery);
  if (Number.isFinite(m) && m >= 1 && m <= 12) {
    return `yf_driver_month_${pad2(m)}${driver ? `_${driver}` : ""}.pdf`;
  }
  return `yf_driver_month_${formatUtcDateStamp(at)}.pdf`;
}

function makeYfLkwWeekFilename(year, week, lkwId, at = new Date()) {
  const y = Number.parseInt(String(year), 10);
  const w = Number.parseInt(String(week), 10);
  const lkw = sanitizeFilenamePart(lkwId);
  if (Number.isFinite(y) && Number.isFinite(w) && y > 0 && w >= 1 && w <= 53) {
    return `yf_lkw_${y}_w${pad2(w)}${lkw ? `_${lkw}` : ""}.pdf`;
  }
  return `yf_lkw_${formatUtcDateStamp(at)}.pdf`;
}

function makeYfLkwMonthFilename(year, month, lkwId, at = new Date()) {
  const y = Number.parseInt(String(year), 10);
  const m = Number.parseInt(String(month), 10);
  const lkw = sanitizeFilenamePart(lkwId);
  if (Number.isFinite(y) && Number.isFinite(m) && y > 0 && m >= 1 && m <= 12) {
    return `yf_lkw_${y}_${pad2(m)}${lkw ? `_${lkw}` : ""}.pdf`;
  }
  return `yf_lkw_${formatUtcDateStamp(at)}.pdf`;
}

function makeBonusFilename(year, month, at = new Date(), period = "month") {
  const y = Number.parseInt(String(year), 10);
  const m = Number.parseInt(String(month), 10);
  if (period === "year" && Number.isFinite(y) && y > 0) {
    return `bonus_${y}_year.pdf`;
  }
  if (Number.isFinite(y) && Number.isFinite(m) && y > 0 && m >= 1 && m <= 12) {
    return `bonus_${y}_${pad2(m)}.pdf`;
  }
  return `bonus_${formatUtcDateStamp(at)}.pdf`;
}

function makeBonusFirmaMonthFilename(year, month, firmaName, at = new Date()) {
  const y = Number.parseInt(String(year), 10);
  const m = Number.parseInt(String(month), 10);
  const firma = sanitizeFilenamePart(firmaName);
  if (Number.isFinite(y) && Number.isFinite(m) && y > 0 && m >= 1 && m <= 12) {
    return `bonus_firma_${y}_${pad2(m)}${firma ? `_${firma}` : ""}.pdf`;
  }
  return `bonus_firma_${formatUtcDateStamp(at)}.pdf`;
}

function makeFahrerAllFilename(reportYear, at = new Date()) {
  const y = Number.parseInt(String(reportYear), 10);
  if (Number.isFinite(y) && y > 0) {
    return `fahrer_all_${y}.pdf`;
  }
  return `fahrer_all_${formatUtcDateStamp(at)}.pdf`;
}

function makeFahrerCardFilename(driverQuery, at = new Date()) {
  const driver = sanitizeFilenamePart(driverQuery);
  if (driver) return `fahrer_card_${driver}.pdf`;
  return `fahrer_card_${formatUtcDateStamp(at)}.pdf`;
}

function makeFahrerTypeFilename(lkwType, at = new Date()) {
  const kind = sanitizeFilenamePart(lkwType);
  if (kind) return `fahrer_${kind}_${formatUtcDateStamp(at)}.pdf`;
  return `fahrer_type_${formatUtcDateStamp(at)}.pdf`;
}

function makeFahrerFirmaFilename(firmaName, at = new Date()) {
  const firma = sanitizeFilenamePart(firmaName);
  if (firma) return `fahrer_firma_${firma}_${formatUtcDateStamp(at)}.pdf`;
  return `fahrer_firma_${formatUtcDateStamp(at)}.pdf`;
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
    page.drawText(formatReportGeneratedLabel(userId), {
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

function classifyDriverAssignmentCell(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "without_driver";
  const normalized = raw.toLowerCase();

  if (normalized.includes("verkauft")) return "without_driver";
  if (normalized.includes("werkstatt")) return "werkstatt";
  if (normalized.includes("ersatzwagen")) return "ersatzwagen";
  if (/\bo\.?\s*f\.?\b/.test(normalized)) return "of";
  return "work";
}

function buildDriverAssignmentStats(periodDefs = [], matrixRows = []) {
  const rows = Array.isArray(matrixRows) ? matrixRows : [];
  const defs = Array.isArray(periodDefs) ? periodDefs : [];

  return defs.map((period) => {
    const stats = {
      period_label: String(period.label || period.key || ""),
      work_lkw: 0,
      of_count: 0,
      ersatzwagen: 0,
      werkstatt: 0,
      all_lkw: rows.length,
      without_driver: 0,
    };

    for (const row of rows) {
      const kind = classifyDriverAssignmentCell(row?.[period.key]);
      if (kind === "work") stats.work_lkw += 1;
      else if (kind === "of") stats.of_count += 1;
      else if (kind === "ersatzwagen") stats.ersatzwagen += 1;
      else if (kind === "werkstatt") stats.werkstatt += 1;
      else stats.without_driver += 1;
    }

    return stats;
  });
}

function compactStatsPeriodLabel(label) {
  const text = String(label || "").trim();
  const weekMatch = /W(\d{1,2})/i.exec(text);
  if (weekMatch) return `W${pad2(toIntSafe(weekMatch[1], 0))}`;
  const firstPart = text.split(/\s+/)[0];
  return firstPart || text;
}

function drawStatsTableAndChart({
  pdfDoc,
  page,
  pageSize,
  margin,
  y,
  title,
  statsRows,
  font,
  boldFont,
}) {
  const rows = Array.isArray(statsRows) ? statsRows : [];
  if (!rows.length) return { page, y };

  const textColor = rgb(0.08, 0.14, 0.24);
  const borderColor = rgb(0.74, 0.8, 0.9);
  const headerBg = rgb(0.93, 0.96, 1);
  const oddBg = rgb(0.985, 0.99, 1);
  const tableWidth = pageSize[0] - (margin * 2);

  const ensureSpace = (needHeight) => {
    if (y - needHeight >= margin) return;
    page = pdfDoc.addPage(pageSize);
    y = page.getHeight() - margin;
  };

  const metricDefs = [
    { key: "work_lkw", label: "Work LKW" },
    { key: "of_count", label: "O.F." },
    { key: "ersatzwagen", label: "Ersatzwagen" },
    { key: "werkstatt", label: "Werkstatt" },
    { key: "all_lkw", label: "All LKW" },
    { key: "without_driver", label: "LKW Ohne Fahrer" },
  ];

  const rowHeight = 15;
  const metricColWidth = Math.max(118, Math.min(156, Math.floor(tableWidth * 0.24)));
  const valueColWidth = Math.max(48, Math.floor((tableWidth - metricColWidth) / rows.length));
  const fullWidth = metricColWidth + (valueColWidth * rows.length);
  const tableHeight = rowHeight * (metricDefs.length + 1);
  const chartHeight = 150;
  const sectionPad = 26;
  ensureSpace(20 + tableHeight + sectionPad + chartHeight + 24);

  page.drawText(safeText(title, "Statistics"), {
    x: margin,
    y,
    size: 11,
    font: boldFont,
    color: textColor,
  });
  y -= 14;

  page.drawRectangle({
    x: margin,
    y: y - rowHeight + 2,
    width: fullWidth,
    height: rowHeight,
    color: headerBg,
    borderColor,
    borderWidth: 1,
  });

  page.drawText("STATISTIK", {
    x: margin + 4,
    y: y - 9,
    size: 8,
    font: boldFont,
    color: textColor,
  });

  for (let i = 0; i < rows.length; i += 1) {
    const x = margin + metricColWidth + (i * valueColWidth);
    const label = fitTextToWidth(boldFont, rows[i].period_label, 8, valueColWidth - 8);
    page.drawText(label, {
      x: x + 4,
      y: y - 9,
      size: 8,
      font: boldFont,
      color: textColor,
    });
    if (i > 0) {
      page.drawLine({
        start: { x, y: y - rowHeight + 2 },
        end: { x, y: y + 2 },
        thickness: 0.6,
        color: borderColor,
      });
    }
  }
  y -= rowHeight;

  let rowIdx = 0;
  for (const metric of metricDefs) {
    if (rowIdx % 2 === 1) {
      page.drawRectangle({
        x: margin,
        y: y - rowHeight + 2,
        width: fullWidth,
        height: rowHeight,
        color: oddBg,
      });
    }

    page.drawText(metric.label, {
      x: margin + 4,
      y: y - 9,
      size: 8,
      font,
      color: textColor,
    });

    for (let i = 0; i < rows.length; i += 1) {
      const x = margin + metricColWidth + (i * valueColWidth);
      const val = toIntSafe(rows[i]?.[metric.key], 0);
      page.drawText(String(val), {
        x: x + 4,
        y: y - 9,
        size: 8,
        font,
        color: textColor,
      });
      page.drawLine({
        start: { x, y: y - rowHeight + 2 },
        end: { x, y: y + 2 },
        thickness: 0.45,
        color: borderColor,
      });
    }

    page.drawLine({
      start: { x: margin, y: y - rowHeight + 2 },
      end: { x: margin + fullWidth, y: y - rowHeight + 2 },
      thickness: 0.45,
      color: borderColor,
    });
    y -= rowHeight;
    rowIdx += 1;
  }

  page.drawRectangle({
    x: margin,
    y: y + 2,
    width: fullWidth,
    height: tableHeight,
    borderColor,
    borderWidth: 1,
    color: rgb(1, 1, 1),
    opacity: 0,
  });

  y -= 10;
  ensureSpace(chartHeight + 24);

  const chartX = margin;
  const chartY = y - chartHeight;
  const plotPadTop = 18;
  const plotPadBottom = 20;
  const plotHeight = chartHeight - plotPadTop - plotPadBottom;
  const chartSeries = [
    { key: "work_lkw", label: "Work LKW", color: rgb(0.26, 0.52, 0.82) },
    { key: "all_lkw", label: "All LKW", color: rgb(0.62, 0.64, 0.69) },
    { key: "without_driver", label: "LKW Ohne Fahrer", color: rgb(1, 0.5, 0.1) },
  ];

  page.drawRectangle({
    x: chartX,
    y: chartY,
    width: fullWidth,
    height: chartHeight,
    borderColor,
    borderWidth: 1,
    color: rgb(0.99, 0.995, 1),
  });

  let legendX = chartX + 8;
  const legendY = chartY + chartHeight - 11;
  for (const series of chartSeries) {
    page.drawRectangle({
      x: legendX,
      y: legendY - 4,
      width: 7,
      height: 7,
      color: series.color,
    });
    page.drawText(series.label, {
      x: legendX + 10,
      y: legendY - 3,
      size: 7,
      font,
      color: textColor,
    });
    legendX += 82;
  }

  const maxVal = Math.max(
    1,
    ...rows.flatMap((row) => chartSeries.map((series) => toIntSafe(row?.[series.key], 0))),
  );

  const gridSteps = 4;
  for (let g = 0; g <= gridSteps; g += 1) {
    const ratio = g / gridSteps;
    const gy = chartY + plotPadBottom + (plotHeight * ratio);
    page.drawLine({
      start: { x: chartX + 1, y: gy },
      end: { x: chartX + fullWidth - 1, y: gy },
      thickness: 0.35,
      color: rgb(0.86, 0.9, 0.95),
    });
    const val = Math.round((maxVal * ratio));
    page.drawText(String(val), {
      x: chartX + 3,
      y: gy + 1,
      size: 6,
      font,
      color: rgb(0.4, 0.46, 0.56),
    });
  }

  const groupWidth = fullWidth / rows.length;
  const barGap = 3;
  const barCount = chartSeries.length;
  const barWidth = Math.max(4, Math.min(16, ((groupWidth - 10) - ((barCount - 1) * barGap)) / barCount));
  const groupContentWidth = (barWidth * barCount) + ((barCount - 1) * barGap);
  const baselineY = chartY + plotPadBottom;

  for (let i = 0; i < rows.length; i += 1) {
    const groupX = chartX + (i * groupWidth) + ((groupWidth - groupContentWidth) / 2);
    for (let s = 0; s < chartSeries.length; s += 1) {
      const series = chartSeries[s];
      const value = toIntSafe(rows[i]?.[series.key], 0);
      const barHeight = Math.max(0, Math.floor((value / maxVal) * plotHeight));
      const x = groupX + (s * (barWidth + barGap));
      page.drawRectangle({
        x,
        y: baselineY,
        width: barWidth,
        height: barHeight,
        color: series.color,
      });
    }

    page.drawText(fitTextToWidth(font, compactStatsPeriodLabel(rows[i].period_label), 7, groupWidth - 4), {
      x: chartX + (i * groupWidth) + 2,
      y: chartY + 4,
      size: 7,
      font,
      color: textColor,
    });
  }

  y = chartY - 14;
  return { page, y };
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
  const statusBg = rgb(0.92, 0.92, 0.92);
  const urlaubBg = rgb(1, 0.86, 0.66);

  const getCellStyle = (rawValue) => {
    const value = safeText(rawValue, "").trim();
    const upper = value.toUpperCase();
    const isStatus = ["O.F.", "VERKAUFT", "WERKSTATT", "WERKSTATTWAGEN"].some((token) => upper.includes(token));
    const isUrlaub = /(?:^|\s)U$/.test(value);
    return {
      fill: isStatus ? statusBg : (isUrlaub ? urlaubBg : null),
      font: isStatus ? boldFont : font,
      size: isStatus ? textSize + 2 : textSize,
    };
  };

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
    page.drawText(formatReportGeneratedLabel(userId), {
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
      const labelWidth = measureTextWidth(boldFont, label, textSize);
      page.drawText(label, {
        x: x + ((col.width - labelWidth) / 2),
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
      const rawValue = safeText(row?.[col.key], "");
      const style = getCellStyle(rawValue);
      if (style.fill) {
        page.drawRectangle({
          x,
          y: y - rowHeight + 2,
          width: col.width,
          height: rowHeight,
          color: style.fill,
        });
      }
      const value = fitTextToWidth(style.font, rawValue, style.size, col.width - 8);
      const tx = x + ((col.width - measureTextWidth(style.font, value, style.size)) / 2);
      page.drawText(value, {
        x: tx,
        y: y - (style.size > textSize ? 10 : 9),
        size: style.size,
        font: style.font,
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
  const statusBg = rgb(0.92, 0.92, 0.92);
  const urlaubBg = rgb(1, 0.86, 0.66);

  const getCellStyle = (rawValue) => {
    const value = safeText(rawValue, "").trim();
    const upper = value.toUpperCase();
    const isStatus = ["O.F.", "VERKAUFT", "WERKSTATT", "WERKSTATTWAGEN"].some((token) => upper.includes(token));
    const isUrlaub = /(?:^|\s)U$/.test(value);
    return {
      fill: isStatus ? statusBg : (isUrlaub ? urlaubBg : null),
      font: isStatus ? boldFont : font,
      size: isStatus ? textSize + 2 : textSize,
    };
  };

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
    page.drawText(formatReportGeneratedLabel(userId), {
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
      const labelWidth = measureTextWidth(boldFont, label, textSize);
      page.drawText(label, {
        x: x + ((col.width - labelWidth) / 2),
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
      const rawValue = safeText(row?.[col.key], "");
      const style = getCellStyle(rawValue);
      if (style.fill) {
        page.drawRectangle({
          x,
          y: y - rowHeight + 2,
          width: col.width,
          height: rowHeight,
          color: style.fill,
        });
      }
      const value = fitTextToWidth(style.font, rawValue, style.size, col.width - 8);
      const tx = x + ((col.width - measureTextWidth(style.font, value, style.size)) / 2);
      page.drawText(value, {
        x: tx,
        y: y - (style.size > textSize ? 10 : 9),
        size: style.size,
        font: style.font,
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

const EINNAHMEN_MONTHS_DE = [
  "Januar",
  "Februar",
  "Maerz",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

const BONUS_MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function toNumberSafe(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const normalized = raw.replace(/\s+/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(value) {
  const n = toNumberSafe(value, 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped}.${decPart}`;
}

function formatMoneyCompact(value) {
  const n = toNumberSafe(value, 0);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return formatMoney(n);
}

function formatMoneyInt(value) {
  const n = toNumberSafe(value, 0);
  const sign = n < 0 ? "-" : "";
  const rounded = Math.round(Math.abs(n));
  return `${sign}${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
}

function hasValueData(value) {
  return Math.abs(toNumberSafe(value, 0)) >= 0.005;
}

function calcMonthTrendPct(current, previous) {
  const curr = toNumberSafe(current, 0);
  const prev = toNumberSafe(previous, 0);
  if (Math.abs(prev) < 0.000001) {
    if (Math.abs(curr) < 0.000001) return 0;
    return null;
  }
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function buildEinnahmenMatrixRows(rows = []) {
  const byMonth = new Map();
  for (const row of rows || []) {
    const idx = toIntSafe(row?.month_index, 0);
    if (idx < 1 || idx > 12) continue;
    byMonth.set(idx, {
      month_index: idx,
      month_name: safeText(row?.month_name, EINNAHMEN_MONTHS_DE[idx - 1]),
      nahverkehr: toNumberSafe(row?.nahverkehr, 0),
      logistics: toNumberSafe(row?.logistics, 0),
      gesamt: toNumberSafe(row?.gesamt, 0),
    });
  }
  if (!byMonth.size) return [];

  const out = [];
  for (let monthIdx = 1; monthIdx <= 12; monthIdx += 1) {
    out.push(
      byMonth.get(monthIdx) || {
        month_index: monthIdx,
        month_name: EINNAHMEN_MONTHS_DE[monthIdx - 1],
        nahverkehr: 0,
        logistics: 0,
        gesamt: 0,
      },
    );
  }
  return out;
}

function formatEinnahmenCell(value) {
  const n = toNumberSafe(value, 0);
  if (Math.abs(n) < 0.0000001) return "";
  return formatMoney(value);
}

function drawTrendArrow({ page, x, y, isUp, color }) {
  if (isUp) {
    page.drawLine({ start: { x, y }, end: { x, y: y + 7 }, thickness: 1.2, color });
    page.drawLine({ start: { x, y: y + 7 }, end: { x: x - 2.2, y: y + 4.6 }, thickness: 1.2, color });
    page.drawLine({ start: { x, y: y + 7 }, end: { x: x + 2.2, y: y + 4.6 }, thickness: 1.2, color });
  } else {
    page.drawLine({ start: { x, y: y + 7 }, end: { x, y }, thickness: 1.2, color });
    page.drawLine({ start: { x, y }, end: { x: x - 2.2, y: y + 2.2 }, thickness: 1.2, color });
    page.drawLine({ start: { x, y }, end: { x: x + 2.2, y: y + 2.2 }, thickness: 1.2, color });
  }
}

async function buildEinnahmenPdfWithPdfLib({ userId, rows }) {
  const matrixRows = buildEinnahmenMatrixRows(rows);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [842, 595]; // A4 landscape
  const margin = 24;
  const rowHeight = 16;
  const textSize = 8;
  const textColor = rgb(0.08, 0.14, 0.24);
  const borderColor = rgb(0.74, 0.8, 0.9);
  const headerBg = rgb(0.93, 0.96, 1);
  const oddBg = rgb(0.985, 0.99, 1);

  const columns = [
    { key: "month_name", label: "Monat", width: 170 },
    { key: "nahverkehr", label: "Nahverkehr", width: 195 },
    { key: "logistics", label: "Logistics", width: 195 },
    { key: "gesamt", label: "Gesamt", width: 210 },
  ];
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const tableX = margin;

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawPageHeader = () => {
    page.drawText("Einnahmen (Bericht_Dispo)", {
      x: margin,
      y,
      size: 13,
      font: boldFont,
      color: textColor,
    });
    y -= 16;
    page.drawText(formatReportGeneratedLabel(userId), {
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
      const labelWidth = measureTextWidth(boldFont, col.label, textSize);
      page.drawText(col.label, {
        x: x + ((col.width - labelWidth) / 2),
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

    const values = [
      safeText(row?.month_name, ""),
      formatEinnahmenCell(row?.nahverkehr),
      formatEinnahmenCell(row?.logistics),
      formatEinnahmenCell(row?.gesamt),
    ];

    let x = tableX;
    for (let i = 0; i < columns.length; i += 1) {
      const col = columns[i];
      const isGesamt = col.key === "gesamt";
      const cellFont = isGesamt ? boldFont : font;
      const cellSize = isGesamt ? textSize + 2 : textSize;
      const value = fitTextToWidth(cellFont, values[i], cellSize, col.width - 8);
      const tx = x + ((col.width - measureTextWidth(cellFont, value, cellSize)) / 2);
      page.drawText(value, {
        x: tx,
        y: y - (isGesamt ? 10 : 9),
        size: cellSize,
        font: cellFont,
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

  if (!matrixRows.length) {
    ensureSpace(20);
    page.drawText("No rows found.", {
      x: margin,
      y: y - 10,
      size: 9,
      font,
      color: textColor,
    });
    return pdfDoc.save();
  }

  for (let idx = 0; idx < matrixRows.length; idx += 1) {
    ensureSpace(rowHeight + 2);
    drawRow(matrixRows[idx], idx);
  }

  const chartHeight = 210;
  y -= 12;
  ensureSpace(chartHeight + 24);

  const chartX = margin;
  const chartY = y - chartHeight;
  const chartWidth = tableWidth;
  const plotPadTop = 12;
  const plotPadBottom = 34;
  const plotPadLeft = 16;
  const plotPadRight = 16;
  const plotHeight = chartHeight - plotPadTop - plotPadBottom;
  const plotWidth = chartWidth - plotPadLeft - plotPadRight;
  const baselineY = chartY + plotPadBottom;
  const plotX = chartX + plotPadLeft;
  const progressColor = rgb(0.18, 0.72, 0.28);
  const regressColor = rgb(0.88, 0.24, 0.2);
  const barColor = rgb(0.3, 0.56, 0.84);

  page.drawRectangle({
    x: chartX,
    y: chartY,
    width: chartWidth,
    height: chartHeight,
    borderColor,
    borderWidth: 1,
    color: rgb(0.99, 0.995, 1),
  });

  const maxVal = Math.max(1, ...matrixRows.map((row) => toNumberSafe(row?.gesamt, 0)));
  const groupWidth = plotWidth / matrixRows.length;
  const barWidth = Math.max(20, Math.min(52, groupWidth * 0.82));

  for (let i = 0; i < matrixRows.length; i += 1) {
    const row = matrixRows[i];
    const value = toNumberSafe(row?.gesamt, 0);
    const barHeight = Math.max(0, Math.floor((value / maxVal) * plotHeight));
    const centerX = plotX + (i * groupWidth) + (groupWidth / 2);
    const barX = centerX - (barWidth / 2);
    page.drawRectangle({
      x: barX,
      y: baselineY,
      width: barWidth,
      height: barHeight,
      color: barColor,
    });

    const monthLabel = fitTextToWidth(font, String(row?.month_name || "").slice(0, 3), 7, groupWidth - 4);
    page.drawText(monthLabel, {
      x: centerX - (measureTextWidth(font, monthLabel, 7) / 2),
      y: chartY + 4,
      size: 7,
      font,
      color: textColor,
    });

    if (hasValueData(value)) {
      const valueLabel = formatMoneyInt(value);
      const prevValue = i > 0 ? toNumberSafe(matrixRows[i - 1]?.gesamt, 0) : 0;
      const trend = i > 0 ? calcMonthTrendPct(value, prevValue) : null;
      const trendLabel = trend === null
        ? ""
        : `; ${trend >= 0 ? "+" : ""}${trend.toFixed(1)}%`;
      const trendColor = trend === null
        ? rgb(0.96, 0.98, 1)
        : trend > 0
          ? progressColor
          : trend < 0
            ? regressColor
            : rgb(0.96, 0.98, 1);
      const valueSize = Math.max(6.2, Math.min(7.6, groupWidth * 0.13));
      const pctSize = Math.max(5.2, Math.min(6.4, groupWidth * 0.1));
      const labelMaxWidth = Math.max(24, barWidth - 6);
      const fittedValueLabel = fitTextToWidth(boldFont, valueLabel, valueSize, labelMaxWidth);
      const fittedTrendLabel = trendLabel
        ? fitTextToWidth(boldFont, trendLabel, pctSize, labelMaxWidth)
        : "";
      const valueWidth = measureTextWidth(boldFont, fittedValueLabel, valueSize);
      const trendWidth = fittedTrendLabel ? measureTextWidth(boldFont, fittedTrendLabel, pctSize) : 0;
      const insideBar = barHeight >= 28;
      const valueColor = insideBar ? rgb(0.97, 0.985, 1) : textColor;
      const trendInk = insideBar && trend === null ? rgb(0.97, 0.985, 1) : trendColor;
      const baseLabelY = insideBar ? baselineY + 6 : baselineY + barHeight + 6;
      const trendY = baseLabelY;
      const valueY = trendLabel ? trendY + pctSize + 2 : baseLabelY + 1;

      page.drawText(fittedValueLabel, {
        x: centerX - (valueWidth / 2),
        y: valueY,
        size: valueSize,
        font: boldFont,
        color: valueColor,
      });
      if (fittedTrendLabel) {
        page.drawText(fittedTrendLabel, {
          x: centerX - (trendWidth / 2),
          y: trendY,
          size: pctSize,
          font: boldFont,
          color: trendInk,
        });
      }
    }
  }

  return pdfDoc.save();
}

const EINNAHMEN_FIRM_MONTHS = [
  { key: "january", label: "Januar" },
  { key: "february", label: "Februar" },
  { key: "march", label: "Maerz" },
  { key: "april", label: "April" },
  { key: "may", label: "Mai" },
  { key: "june", label: "Juni" },
  { key: "july", label: "Juli" },
  { key: "august", label: "August" },
  { key: "september", label: "September" },
  { key: "october", label: "Oktober" },
  { key: "november", label: "November" },
  { key: "december", label: "Dezember" },
];

function buildEinnahmenFirmRows(rows = []) {
  return (rows || [])
    .map((row) => ({
      row_index: toIntSafe(row?.row_index, 0),
      firm_name: safeText(row?.firm_name, ""),
      january: toNumberSafe(row?.january, 0),
      february: toNumberSafe(row?.february, 0),
      march: toNumberSafe(row?.march, 0),
      april: toNumberSafe(row?.april, 0),
      may: toNumberSafe(row?.may, 0),
      june: toNumberSafe(row?.june, 0),
      july: toNumberSafe(row?.july, 0),
      august: toNumberSafe(row?.august, 0),
      september: toNumberSafe(row?.september, 0),
      october: toNumberSafe(row?.october, 0),
      november: toNumberSafe(row?.november, 0),
      december: toNumberSafe(row?.december, 0),
      total: toNumberSafe(row?.total, 0),
    }))
    .filter((row) => row.row_index > 0 && row.firm_name)
    .sort((a, b) => rowOrderValue(a.row_index, a.firm_name) - rowOrderValue(b.row_index, b.firm_name))
    .slice(0, 20);
}

function rowOrderValue(rowIndex, firmName) {
  return (toIntSafe(rowIndex, 0) * 1000) + (safeText(firmName, "").length ? 0 : 999);
}

function getEinnahmenFirmActiveMonths(rows = []) {
  const active = EINNAHMEN_FIRM_MONTHS.filter(({ key }) => rows.some((row) => hasValueData(row?.[key])));
  return active.length ? active : EINNAHMEN_FIRM_MONTHS.slice(0, 3);
}

function formatEinnahmenFirmCell(value) {
  const n = toNumberSafe(value, 0);
  if (Math.abs(n) < 0.0000001) return "";
  return formatMoneyInt(n);
}

function drawEinnahmenFirmChartPage({ pdfDoc, font, boldFont, userId, rows }) {
  const pageSize = [1190, 842];
  const page = pdfDoc.addPage(pageSize);
  const margin = 28;
  const textColor = rgb(0.08, 0.14, 0.24);
  const borderColor = rgb(0.74, 0.8, 0.9);
  const cardBg = rgb(0.99, 0.995, 1);
  const seriesPalette = [
    rgb(0.31, 0.55, 0.84),
    rgb(0.96, 0.53, 0.16),
    rgb(0.7, 0.7, 0.72),
    rgb(0.24, 0.68, 0.4),
    rgb(0.63, 0.42, 0.82),
    rgb(0.84, 0.28, 0.39),
    rgb(0.17, 0.64, 0.68),
    rgb(0.61, 0.52, 0.35),
    rgb(0.47, 0.63, 0.19),
    rgb(0.2, 0.32, 0.55),
    rgb(0.84, 0.46, 0.71),
    rgb(0.55, 0.55, 0.55),
  ];

  let y = page.getHeight() - margin;
  page.drawText("Einnahmen nach Firma (Bericht_Dispo BS:CF)", {
    x: margin,
    y,
    size: 16,
    font: boldFont,
    color: textColor,
  });
  y -= 18;
  page.drawText(formatReportGeneratedLabel(userId), {
    x: margin,
    y,
    size: 8,
    font,
    color: rgb(0.24, 0.3, 0.4),
  });
  y -= 18;

  const chartX = margin;
  const chartY = 72;
  const chartWidth = page.getWidth() - (margin * 2);
  const chartHeight = y - chartY;
  page.drawRectangle({
    x: chartX,
    y: chartY,
    width: chartWidth,
    height: chartHeight,
    borderColor,
    borderWidth: 1,
    color: cardBg,
  });

  if (!rows.length) {
    page.drawText("No rows found.", {
      x: margin + 12,
      y: y - 20,
      size: 10,
      font,
      color: textColor,
    });
    return;
  }

  const months = getEinnahmenFirmActiveMonths(rows);
  const maxVal = Math.max(
    1,
    ...rows.flatMap((row) => months.map(({ key }) => toNumberSafe(row?.[key], 0))),
  );
  const labelColWidth = 330;
  const legendHeight = 28;
  const plotPadTop = 18;
  const plotPadBottom = 28 + legendHeight;
  const plotPadRight = 24;
  const plotX = chartX + labelColWidth;
  const plotY = chartY + plotPadBottom;
  const plotWidth = chartWidth - labelColWidth - plotPadRight;
  const plotHeight = chartHeight - plotPadTop - plotPadBottom;
  const groupHeight = plotHeight / rows.length;
  const baselineX = plotX;

  page.drawLine({
    start: { x: baselineX, y: plotY - 4 },
    end: { x: baselineX, y: plotY + plotHeight + 2 },
    thickness: 1,
    color: rgb(0.82, 0.84, 0.88),
  });

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx += 1) {
    const row = rows[rowIdx];
    const groupTop = plotY + plotHeight - (rowIdx * groupHeight);
    const groupBottom = groupTop - groupHeight;
    const label = fitTextToWidth(boldFont, safeText(row?.firm_name, ""), 9, labelColWidth - 18);
    const labelWidth = measureTextWidth(boldFont, label, 9);
    page.drawText(label, {
      x: chartX + labelColWidth - labelWidth - 14,
      y: groupBottom + (groupHeight / 2) - 4,
      size: 9,
      font: boldFont,
      color: rgb(0.34, 0.34, 0.36),
    });

    const seriesGap = 3;
    const availableHeight = Math.max(12, groupHeight - 8);
    const barHeight = Math.max(4, Math.min(16, (availableHeight - (seriesGap * (months.length - 1))) / Math.max(1, months.length)));
    const blockHeight = (barHeight * months.length) + (seriesGap * (months.length - 1));
    let barY = groupBottom + ((groupHeight - blockHeight) / 2);

    for (let monthIdx = 0; monthIdx < months.length; monthIdx += 1) {
      const monthDef = months[monthIdx];
      const value = toNumberSafe(row?.[monthDef.key], 0);
      const barWidth = Math.max(0, (value / maxVal) * (plotWidth - 24));
      const color = seriesPalette[monthIdx % seriesPalette.length];
      if (barWidth > 0) {
        page.drawRectangle({
          x: baselineX,
          y: barY,
          width: barWidth,
          height: barHeight,
          color,
        });
      }
      if (hasValueData(value)) {
        const valueLabel = formatMoneyInt(value);
        page.drawText(valueLabel, {
          x: baselineX + barWidth + 6,
          y: barY + Math.max(0, (barHeight - 8) / 2),
          size: 8,
          font: boldFont,
          color,
        });
      }
      barY += barHeight + seriesGap;
    }
  }

  const legendY = chartY + 12;
  const legendGap = 16;
  let legendX = chartX + 22;
  let legendRowY = legendY;
  for (let monthIdx = 0; monthIdx < months.length; monthIdx += 1) {
    const monthDef = months[monthIdx];
    const color = seriesPalette[monthIdx % seriesPalette.length];
    const labelWidth = measureTextWidth(boldFont, monthDef.label, 9);
    if (legendX + 14 + labelWidth > chartX + chartWidth - 24) {
      legendX = chartX + 22;
      legendRowY += 14;
    }
    page.drawRectangle({
      x: legendX,
      y: legendRowY,
      width: 10,
      height: 10,
      color,
    });
    legendX += 14;
    page.drawText(monthDef.label, {
      x: legendX,
      y: legendRowY + 1,
      size: 9,
      font: boldFont,
      color: textColor,
    });
    legendX += labelWidth + legendGap;
  }
}

function drawEinnahmenFirmBubblePage({ pdfDoc, font, boldFont, userId, rows }) {
  const pageSize = [1190, 842];
  const page = pdfDoc.addPage(pageSize);
  const margin = 28;
  const textColor = rgb(0.08, 0.14, 0.24);
  const borderColor = rgb(0.74, 0.8, 0.9);
  const cardBg = rgb(0.99, 0.995, 1);
  const spherePalette = [
    rgb(0.33, 0.56, 0.86),
    rgb(0.96, 0.55, 0.18),
    rgb(0.45, 0.71, 0.39),
    rgb(0.68, 0.57, 0.86),
    rgb(0.84, 0.37, 0.48),
    rgb(0.18, 0.67, 0.72),
    rgb(0.58, 0.58, 0.62),
    rgb(0.74, 0.62, 0.34),
  ];

  let y = page.getHeight() - margin;
  page.drawText("Einnahmen nach Firma - Sphere View (Top 20 by Total)", {
    x: margin,
    y,
    size: 16,
    font: boldFont,
    color: textColor,
  });
  y -= 18;
  page.drawText(formatReportGeneratedLabel(userId), {
    x: margin,
    y,
    size: 8,
    font,
    color: rgb(0.24, 0.3, 0.4),
  });
  y -= 18;

  const chartX = margin;
  const chartY = 56;
  const chartWidth = page.getWidth() - (margin * 2);
  const chartHeight = y - chartY;
  page.drawRectangle({
    x: chartX,
    y: chartY,
    width: chartWidth,
    height: chartHeight,
    borderColor,
    borderWidth: 1,
    color: cardBg,
  });

  const bubbleRows = [...(rows || [])]
    .sort((a, b) => toNumberSafe(b?.total, 0) - toNumberSafe(a?.total, 0))
    .slice(0, 20);
  if (!bubbleRows.length) {
    page.drawText("No rows found.", {
      x: margin + 12,
      y: y - 20,
      size: 10,
      font,
      color: textColor,
    });
    return;
  }

  const cols = 5;
  const rowsCount = Math.ceil(bubbleRows.length / cols);
  const innerPadX = 22;
  const innerPadY = 18;
  const cellW = (chartWidth - (innerPadX * 2)) / cols;
  const cellH = (chartHeight - (innerPadY * 2)) / rowsCount;
  const maxTotal = Math.max(1, ...bubbleRows.map((row) => toNumberSafe(row?.total, 0)));
  const maxRadius = Math.max(24, Math.min(cellW, cellH) * 0.34);
  const minVisibleRadius = 4;

  const radiusFor = (value) => {
    const n = toNumberSafe(value, 0);
    if (n <= 0) return 0;
    // Bubble area is proportional to value, so diameter visually follows the data scale.
    return Math.max(minVisibleRadius, maxRadius * Math.sqrt(n / maxTotal));
  };

  for (let idx = 0; idx < bubbleRows.length; idx += 1) {
    const row = bubbleRows[idx];
    const col = idx % cols;
    const line = Math.floor(idx / cols);
    const cx = chartX + innerPadX + (col * cellW) + (cellW / 2);
    const cellTop = chartY + chartHeight - innerPadY - (line * cellH);
    const radius = radiusFor(row?.total);
    const cy = cellTop - (cellH * 0.42);
    const baseColor = spherePalette[idx % spherePalette.length];

    if (radius > 0) {
      page.drawCircle({
        x: cx,
        y: cy,
        size: radius,
        color: baseColor,
        borderColor: rgb(0.88, 0.93, 0.98),
        borderWidth: 1.2,
      });
      page.drawCircle({
        x: cx - (radius * 0.22),
        y: cy + (radius * 0.22),
        size: Math.max(3, radius * 0.38),
        color: rgb(0.95, 0.98, 1),
        opacity: 0.3,
      });
      page.drawCircle({
        x: cx + (radius * 0.18),
        y: cy - (radius * 0.16),
        size: Math.max(3, radius * 0.82),
        borderColor: rgb(0.2, 0.28, 0.38),
        borderWidth: 0.5,
        opacity: 0.14,
      });
    }

    const totalLabel = formatMoneyInt(row?.total);
    const labelMaxWidth = Math.max(34, (radius * 2) - 10);
    const totalSize = Math.max(8, Math.min(14, radius * 0.28));
    const totalText = fitTextToWidth(boldFont, totalLabel, totalSize, labelMaxWidth);
    const totalWidth = measureTextWidth(boldFont, totalText, totalSize);
    page.drawText(totalText, {
      x: cx - (totalWidth / 2),
      y: cy - (totalSize * 0.35),
      size: totalSize,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    const firmLabelSize = 8.4;
    const firmLabel = fitTextToWidth(boldFont, safeText(row?.firm_name, ""), firmLabelSize, cellW - 16);
    const firmLabelWidth = measureTextWidth(boldFont, firmLabel, firmLabelSize);
    page.drawText(firmLabel, {
      x: cx - (firmLabelWidth / 2),
      y: Math.max(chartY + 8, cy - radius - 18),
      size: firmLabelSize,
      font: boldFont,
      color: textColor,
    });
  }
}

async function buildEinnahmenFirmPdfWithPdfLib({ userId, rows }) {
  const matrixRows = buildEinnahmenFirmRows(rows);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [1190, 842];
  const margin = 22;
  const rowHeight = 16;
  const textSize = 6.6;
  const textColor = rgb(0.08, 0.14, 0.24);
  const borderColor = rgb(0.74, 0.8, 0.9);
  const headerBg = rgb(0.93, 0.96, 1);
  const oddBg = rgb(0.985, 0.99, 1);
  const columns = resolveAutoColumns({
    columns: [
      { key: "firm_name", label: "Firm", width: "auto", min_width: 220, max_width: 330 },
      ...EINNAHMEN_FIRM_MONTHS.map((month) => ({ key: month.key, label: month.label, width: "auto", min_width: 54, max_width: 78 })),
      { key: "total", label: "Total", width: "auto", min_width: 68, max_width: 92 },
    ],
    rows: matrixRows,
    font,
    size: textSize,
    maxTableWidth: pageSize[0] - (margin * 2),
  });
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const tableX = margin + ((pageSize[0] - (margin * 2) - tableWidth) / 2);

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawPageHeader = () => {
    page.drawText("Einnahmen nach Firma (Bericht_Dispo BS:CF)", {
      x: margin,
      y,
      size: 15,
      font: boldFont,
      color: textColor,
    });
    y -= 16;
    page.drawText(`Rows: first 20 | ${formatReportGeneratedLabel(userId)}`, {
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
      const labelWidth = measureTextWidth(boldFont, label, textSize);
      page.drawText(label, {
        x: x + ((col.width - labelWidth) / 2),
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
          thickness: 0.7,
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
    for (let i = 0; i < columns.length; i += 1) {
      const col = columns[i];
      const isTotal = col.key === "total";
      const cellFont = isTotal ? boldFont : font;
      const cellSize = isTotal ? textSize + 1.4 : textSize;
      const rawValue = col.key === "firm_name"
        ? safeText(row?.firm_name, "")
        : formatEinnahmenFirmCell(row?.[col.key]);
      const value = fitTextToWidth(cellFont, rawValue, cellSize, col.width - 8);
      const valueWidth = measureTextWidth(cellFont, value, cellSize);
      page.drawText(value, {
        x: x + ((col.width - valueWidth) / 2),
        y: y - (isTotal ? 10 : 9),
        size: cellSize,
        font: cellFont,
        color: textColor,
      });
      x += col.width;
      if (x < tableX + tableWidth - 0.5) {
        page.drawLine({
          start: { x, y: y - rowHeight + 2 },
          end: { x, y: y + 2 },
          thickness: 0.45,
          color: borderColor,
        });
      }
    }
    page.drawLine({
      start: { x: tableX, y: y - rowHeight + 2 },
      end: { x: tableX + tableWidth, y: y - rowHeight + 2 },
      thickness: 0.45,
      color: borderColor,
    });
    y -= rowHeight;
  };

  drawPageHeader();
  drawHeaderRow();

  if (!matrixRows.length) {
    page.drawText("No rows found.", {
      x: margin,
      y: y - 10,
      size: 10,
      font,
      color: textColor,
    });
  } else {
    for (let idx = 0; idx < matrixRows.length; idx += 1) {
      ensureSpace(rowHeight + 2);
      drawRow(matrixRows[idx], idx);
    }
  }

  drawEinnahmenFirmChartPage({ pdfDoc, font, boldFont, userId, rows: matrixRows });
  drawEinnahmenFirmBubblePage({ pdfDoc, font, boldFont, userId, rows: matrixRows });
  return pdfDoc.save();
}

function formatPricePerLiter(value) {
  const n = toNumberSafe(value, 0);
  return n.toFixed(2);
}

function parseDieselRawPayload(value) {
  if (value && typeof value === "object") return value;
  return parseJsonSafe(value, {});
}

function getDieselRawCell(payload, colIdx) {
  const obj = parseDieselRawPayload(payload);
  const prefix = `c${colIdx}:`;
  for (const [key, value] of Object.entries(obj || {})) {
    if (key.startsWith(prefix)) return value;
  }
  return null;
}

function buildDieselSnapshotRows(rows = []) {
  const normalized = (rows || [])
    .map((row) => ({
      report_year: toIntSafe(row?.report_year, 0),
      month_index: toIntSafe(row?.month_index, 0),
      raw_payload: parseDieselRawPayload(row?.raw_payload),
    }))
    .filter((row) => row.report_year > 0 && row.month_index >= 1 && row.month_index <= 12)
    .sort((a, b) => (a.report_year - b.report_year) || (a.month_index - b.month_index));

  if (!normalized.length) return [];
  const years = [...new Set(normalized.map((row) => row.report_year))].sort((a, b) => a - b);
  const windowYears = years.slice(0, 2);
  while (windowYears.length < 2) {
    windowYears.push((windowYears[0] || new Date().getUTCFullYear()) + windowYears.length);
  }

  const byKey = new Map(normalized.map((row) => [`${row.report_year}-${row.month_index}`, row]));
  const out = [];
  for (const year of windowYears) {
    for (let month = 1; month <= 12; month += 1) {
      out.push(byKey.get(`${year}-${month}`) || { report_year: year, month_index: month, raw_payload: {} });
    }
  }
  return out;
}

function formatDieselSnapshotCell(value, kind) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (kind === "int") return formatMoneyInt(value);
  if (kind === "year" || kind === "month") return String(toIntSafe(value, 0) || "");
  if (kind === "decimal2") return formatPricePerLiter(value);
  if (kind === "percent1") return `${(toNumberSafe(value, 0) * 100).toFixed(1)}%`;
  if (kind === "percent2") return `${(toNumberSafe(value, 0) * 100).toFixed(2)}%`;
  if (kind === "signed2") return toNumberSafe(value, 0).toFixed(2);
  return safeText(value, "");
}

async function buildDieselPdfWithPdfLib({ userId, rows }) {
  const snapshotRows = buildDieselSnapshotRows(rows);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [842, 595];
  const margin = 18;
  const rowHeight = 17;
  const topHeaderHeight = 20;
  const subHeaderHeight = 18;
  const textColor = rgb(0.08, 0.14, 0.24);
  const borderColor = rgb(0.72, 0.78, 0.88);
  const white = rgb(0.99, 0.99, 1);

  const page1 = {
    title: "Diesel",
    groupHeaders: [
      { label: "Diesel", span: 2, fill: rgb(0.21, 0.35, 0.66) },
      { label: "Distance", span: 2, fill: rgb(0.53, 0.2, 0.6) },
      { label: "Liter", span: 5, fill: rgb(0.21, 0.35, 0.66) },
      { label: "Euro", span: 5, fill: rgb(0.35, 0.55, 0.18) },
      { label: "Euro/Liter", span: 4, fill: rgb(0.79, 0.58, 0.04) },
    ],
    subHeaders: [
      "Month", "Year", "Km", "",
      "Staack", "Shell", "DKV", "Total", "",
      "Staack", "Shell", "DKV", "Total", "",
      "Staack", "Shell", "DKV", "Average",
    ],
    kinds: [
      "month", "year", "int", "text",
      "int", "int", "int", "int", "text",
      "int", "int", "int", "int", "text",
      "decimal2", "decimal2", "decimal2", "decimal2",
    ],
    sourceCols: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    logicalWidths: [46, 50, 68, 10, 58, 58, 52, 60, 10, 60, 60, 56, 62, 10, 54, 54, 54, 60],
    headerFill: [
      rgb(0.83, 0.88, 0.96), rgb(0.83, 0.88, 0.96), rgb(0.95, 0.82, 0.98), rgb(0.97, 0.97, 0.98),
      rgb(0.83, 0.88, 0.96), rgb(0.83, 0.88, 0.96), rgb(0.83, 0.88, 0.96), rgb(0.83, 0.88, 0.96), rgb(0.97, 0.97, 0.98),
      rgb(0.84, 0.92, 0.8), rgb(0.84, 0.92, 0.8), rgb(0.84, 0.92, 0.8), rgb(0.84, 0.92, 0.8), rgb(0.97, 0.97, 0.98),
      rgb(0.99, 0.92, 0.72), rgb(0.99, 0.92, 0.72), rgb(0.99, 0.92, 0.72), rgb(0.99, 0.92, 0.72),
    ],
  };

  const page2 = {
    title: "Diesel",
    groupHeaders: [
      { label: "Diesel", span: 2, fill: rgb(0.21, 0.35, 0.66) },
      { label: "Distance", span: 2, fill: rgb(0.53, 0.2, 0.6) },
      { label: "Liter", span: 2, fill: rgb(0.21, 0.35, 0.66) },
      { label: "Euro", span: 2, fill: rgb(0.35, 0.55, 0.18) },
      { label: "Price", span: 2, fill: rgb(0.79, 0.58, 0.04) },
      { label: "1.3", span: 2, fill: rgb(0.98, 0.96, 0.88), text: textColor },
      { label: "F Price", span: 1, fill: rgb(0.45, 0.24, 0.02) },
      { label: "Vergleich zum Vormonat", span: 4, fill: rgb(0.45, 0.24, 0.02) },
      { label: "0.416", span: 1, fill: rgb(0.91, 0.98, 0.89), text: textColor },
      { label: "Mehr kosten", span: 1, fill: rgb(0.99, 0.92, 0.72), text: textColor },
    ],
    subHeaders: [
      "Month", "Year", "Km", "",
      "Total", "", "Total", "",
      "Average", "", "Basic €", "",
      "Average", "Euro", "+", "",
      "", "Basic km €", "zum Basic",
    ],
    kinds: [
      "month", "year", "int", "text",
      "int", "text", "int", "text",
      "decimal2", "text", "percent1", "text",
      "decimal2", "int", "int", "percent2",
      "text", "decimal2", "signed2",
    ],
    sourceCols: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38],
    logicalWidths: [46, 50, 68, 10, 58, 10, 58, 10, 58, 10, 58, 10, 58, 68, 60, 58, 10, 64, 62],
    headerFill: [
      rgb(0.83, 0.88, 0.96), rgb(0.83, 0.88, 0.96), rgb(0.95, 0.82, 0.98), rgb(0.97, 0.97, 0.98),
      rgb(0.83, 0.88, 0.96), rgb(0.97, 0.97, 0.98), rgb(0.84, 0.92, 0.8), rgb(0.97, 0.97, 0.98),
      rgb(0.99, 0.92, 0.72), rgb(0.97, 0.97, 0.98), rgb(0.99, 0.96, 0.88), rgb(0.97, 0.97, 0.98),
      rgb(0.78, 0.61, 0.39), rgb(0.78, 0.61, 0.39), rgb(0.78, 0.61, 0.39), rgb(0.78, 0.61, 0.39),
      rgb(0.97, 0.97, 0.98), rgb(0.91, 0.98, 0.89), rgb(0.99, 0.92, 0.72),
    ],
  };

  const renderPage = (spec) => {
    const page = pdfDoc.addPage(pageSize);
    const usableWidth = page.getWidth() - (margin * 2);
    const scale = usableWidth / spec.logicalWidths.reduce((sum, w) => sum + w, 0);
    const widths = spec.logicalWidths.map((w) => w * scale);
    let y = page.getHeight() - margin;

    page.drawText(spec.title, {
      x: margin,
      y,
      size: 13,
      font: boldFont,
      color: textColor,
    });
    y -= 16;
    page.drawText(formatReportGeneratedLabel(userId), {
      x: margin,
      y,
      size: 8,
      font,
      color: rgb(0.24, 0.3, 0.4),
    });
    y -= 18;

    let x = margin;
    let colIdx = 0;
    for (const group of spec.groupHeaders) {
      const groupWidth = widths.slice(colIdx, colIdx + group.span).reduce((sum, w) => sum + w, 0);
      page.drawRectangle({
        x,
        y: y - topHeaderHeight + 2,
        width: groupWidth,
        height: topHeaderHeight,
        color: group.fill,
        borderColor,
        borderWidth: 1,
      });
      const label = fitTextToWidth(boldFont, group.label, 9, groupWidth - 6);
      page.drawText(label, {
        x: x + (groupWidth / 2) - (measureTextWidth(boldFont, label, 9) / 2),
        y: y - 12,
        size: 9,
        font: boldFont,
        color: group.text || white,
      });
      x += groupWidth;
      colIdx += group.span;
    }
    y -= topHeaderHeight;

    x = margin;
    for (let i = 0; i < widths.length; i += 1) {
      page.drawRectangle({
        x,
        y: y - subHeaderHeight + 2,
        width: widths[i],
        height: subHeaderHeight,
        color: spec.headerFill[i],
        borderColor,
        borderWidth: 0.7,
      });
      const text = fitTextToWidth(boldFont, spec.subHeaders[i], 7, widths[i] - 4);
      page.drawText(text, {
        x: x + (widths[i] / 2) - (measureTextWidth(boldFont, text, 7) / 2),
        y: y - 11,
        size: 7,
        font: boldFont,
        color: textColor,
      });
      x += widths[i];
    }
    y -= subHeaderHeight;

    for (let rowIndex = 0; rowIndex < 24; rowIndex += 1) {
      const row = snapshotRows[rowIndex] || { raw_payload: {} };
      const payload = row.raw_payload || {};
      x = margin;
      if (rowIndex % 2 === 1) {
        page.drawRectangle({
          x,
          y: y - rowHeight + 2,
          width: usableWidth,
          height: rowHeight,
          color: rgb(0.985, 0.99, 1),
        });
      }

      for (let i = 0; i < widths.length; i += 1) {
        const value = getDieselRawCell(payload, spec.sourceCols[i]);
        const rendered = formatDieselSnapshotCell(value, spec.kinds[i]);
        const emphasizedHeader = safeText(spec.subHeaders[i], "").trim();
        const isEmphasized = emphasizedHeader === "Km" || emphasizedHeader === "Total" || emphasizedHeader === "Average";
        const cellFont = isEmphasized ? boldFont : font;
        const cellSize = isEmphasized ? 9 : 7;
        const fitted = fitTextToWidth(cellFont, rendered, cellSize, widths[i] - 4);
        const tx = x + ((widths[i] - measureTextWidth(cellFont, fitted, cellSize)) / 2);
        page.drawText(fitted, {
          x: tx,
          y: y - (isEmphasized ? 11 : 10),
          size: cellSize,
          font: cellFont,
          color: textColor,
        });
        page.drawRectangle({
          x,
          y: y - rowHeight + 2,
          width: widths[i],
          height: rowHeight,
          borderColor,
          borderWidth: 0.4,
        });
        x += widths[i];
      }
      y -= rowHeight;
    }
  };

  renderPage(page1);
  renderPage(page2);
  return pdfDoc.save();
}

function formatPercent(value, digits = 1) {
  const n = toNumberSafe(value, 0);
  return `${n.toFixed(digits)}%`;
}

function monthNameDe(monthNumber) {
  const idx = Number.parseInt(String(monthNumber || ""), 10);
  if (Number.isFinite(idx) && idx >= 1 && idx <= 12) return EINNAHMEN_MONTHS_DE[idx - 1];
  return String(monthNumber || "-");
}

function shortenDriverName(name, maxLen = 14) {
  const raw = safeText(name, "");
  if (!raw) return "";
  const parts = raw.split(/\s+/).filter(Boolean);
  const candidate = parts.length > 1 ? parts[parts.length - 1] : raw;
  if (candidate.length <= maxLen) return candidate;
  return `${candidate.slice(0, Math.max(3, maxLen - 1))}~`;
}

function buildBonusMatrixRows(rows = []) {
  return (rows || []).map((row) => ({
    report_year: toIntSafe(row?.report_year, 0),
    report_month: toIntSafe(row?.report_month, 0),
    month_start: safeText(row?.month_start, ""),
    fahrer_id: safeText(row?.fahrer_id, ""),
    fahrer_name: safeText(row?.fahrer_name, ""),
    days: toIntSafe(row?.days, 0),
    km: toNumberSafe(row?.km, 0),
    pct_km: toNumberSafe(row?.pct_km, 0),
    ct: toIntSafe(row?.ct, 0),
    pct_ct: toNumberSafe(row?.pct_ct, 0),
    bonus: toNumberSafe(row?.bonus, 0),
    penalty: toNumberSafe(row?.penalty, 0),
    final: toNumberSafe(row?.final, 0),
  }));
}

function buildBonusYearMatrixRows(rows = [], year) {
  const normalized = buildBonusMatrixRows(rows);
  const byDriver = new Map();
  for (const row of normalized) {
    const key = `${safeText(row?.fahrer_id, "")}__${safeText(row?.fahrer_name, "")}`;
    if (!byDriver.has(key)) {
      byDriver.set(key, {
        fahrer_id: safeText(row?.fahrer_id, ""),
        fahrer_name: safeText(row?.fahrer_name, ""),
        finals: {},
      });
    }
    const target = byDriver.get(key);
    const month = toIntSafe(row?.report_month, 0);
    if (month >= 1 && month <= 12) {
      target.finals[month] = toNumberSafe(row?.final, 0);
    }
  }

  return [...byDriver.values()]
    .map((row) => {
      const out = {
        fahrer_id: row.fahrer_id,
        fahrer_name: row.fahrer_name,
        year_total: 0,
      };
      for (let month = 1; month <= 12; month += 1) {
        const finalValue = toNumberSafe(row.finals[month], 0);
        out[`m${month}`] = finalValue;
        out[`m${month}_label`] = `${BONUS_MONTHS_SHORT[month - 1]} ${year} Final`;
        out.year_total += finalValue;
      }
      return out;
    })
    .sort((a, b) => {
      const nameDiff = safeText(a.fahrer_name, "").localeCompare(safeText(b.fahrer_name, ""));
      if (nameDiff !== 0) return nameDiff;
      return safeText(a.fahrer_id, "").localeCompare(safeText(b.fahrer_id, ""));
    });
}

function formatBonusCell(value, kind) {
  const n = toNumberSafe(value, 0);
  if (Math.abs(n) < 0.0000001) return "";
  if (kind === "int") return String(toIntSafe(value, 0));
  if (kind === "money_int") return formatMoneyInt(value);
  if (kind === "money") return formatMoney(value);
  if (kind === "percent1") return formatPercent(value, 1);
  return safeText(value, "");
}

function summarizeBonusRows(rows = []) {
  const out = {
    drivers: rows.length,
    days_total: 0,
    km_total: 0,
    ct_total: 0,
    bonus_total: 0,
    penalty_total: 0,
    final_total: 0,
    pct_km_avg: 0,
    pct_ct_avg: 0,
  };
  if (!rows.length) return out;

  let pctKmSum = 0;
  let pctCtSum = 0;
  for (const row of rows) {
    out.days_total += toIntSafe(row?.days, 0);
    out.km_total += toNumberSafe(row?.km, 0);
    out.ct_total += toIntSafe(row?.ct, 0);
    out.bonus_total += toNumberSafe(row?.bonus, 0);
    out.penalty_total += toNumberSafe(row?.penalty, 0);
    out.final_total += toNumberSafe(row?.final, 0);
    pctKmSum += toNumberSafe(row?.pct_km, 0);
    pctCtSum += toNumberSafe(row?.pct_ct, 0);
  }

  out.pct_km_avg = pctKmSum / rows.length;
  out.pct_ct_avg = pctCtSum / rows.length;
  return out;
}

async function buildBonusPdfWithPdfLib({
  userId, year, month, driverQuery, rows, filterLabelOverride = "",
}) {
  const matrixRows = buildBonusMatrixRows(rows);
  const summary = summarizeBonusRows(matrixRows);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [842, 595]; // A4 landscape
  const margin = 24;
  const rowHeight = 14;
  const textSize = 7;
  const textColor = rgb(0.08, 0.14, 0.24);
  const borderColor = rgb(0.74, 0.8, 0.9);
  const headerBg = rgb(0.93, 0.96, 1);
  const oddBg = rgb(0.985, 0.99, 1);

  const columns = [
    { key: "fahrer_id", label: "ID", width: 52 },
    { key: "fahrer_name", label: "Fahrer", width: 162 },
    { key: "days", label: "Days", width: 40 },
    { key: "km", label: "KM", width: 74 },
    { key: "pct_km", label: "%KM", width: 46 },
    { key: "ct", label: "CT", width: 40 },
    { key: "pct_ct", label: "%CT", width: 46 },
    { key: "bonus", label: "Bonus", width: 74 },
    { key: "penalty", label: "Penalty", width: 68 },
    { key: "final", label: "Final", width: 68 },
  ];
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const tableX = margin;

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;
  const monthTitle = monthNameDe(month);
  const filterLabel = safeText(filterLabelOverride || driverQuery, "").trim();

  const drawPageHeader = () => {
    page.drawText("Bonus (BonusDynamik)", {
      x: margin,
      y,
      size: 13,
      font: boldFont,
      color: textColor,
    });
    y -= 16;
    page.drawText(
      `Period: ${monthTitle} ${year} | Filter: ${filterLabel || "all Fahrer"} | ${formatReportGeneratedLabel(userId)}`,
      {
        x: margin,
        y,
        size: 8,
        font,
        color: rgb(0.24, 0.3, 0.4),
      },
    );
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
      const labelWidth = measureTextWidth(boldFont, col.label, textSize);
      page.drawText(col.label, {
        x: x + ((col.width - labelWidth) / 2),
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

    const values = [
      safeText(row?.fahrer_id, ""),
      safeText(row?.fahrer_name, ""),
      formatBonusCell(row?.days, "int"),
      formatBonusCell(row?.km, "money_int"),
      formatBonusCell(row?.pct_km, "percent1"),
      formatBonusCell(row?.ct, "int"),
      formatBonusCell(row?.pct_ct, "percent1"),
      formatBonusCell(row?.bonus, "money"),
      formatBonusCell(row?.penalty, "money"),
      formatBonusCell(row?.final, "money_int"),
    ];

    let x = tableX;
    for (let i = 0; i < columns.length; i += 1) {
      const col = columns[i];
      const isFinal = col.key === "final";
      const cellFont = isFinal ? boldFont : font;
      const cellSize = isFinal ? textSize + 1 : textSize;
      const value = fitTextToWidth(cellFont, values[i], cellSize, col.width - 8);
      const tx = x + ((col.width - measureTextWidth(cellFont, value, cellSize)) / 2);
      page.drawText(value, {
        x: tx,
        y: y - (isFinal ? 10 : 9),
        size: cellSize,
        font: cellFont,
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

  if (!matrixRows.length) {
    ensureSpace(20);
    page.drawText("No rows found for selected period/filter.", {
      x: margin,
      y: y - 10,
      size: 9,
      font,
      color: textColor,
    });
    return pdfDoc.save();
  }

  for (let idx = 0; idx < matrixRows.length; idx += 1) {
    ensureSpace(rowHeight + 2);
    drawRow(matrixRows[idx], idx);
  }

  y -= 8;
  const statsBoxHeight = 56;
  ensureSpace(statsBoxHeight + 8);
  page.drawRectangle({
    x: margin,
    y: y - statsBoxHeight,
    width: tableWidth,
    height: statsBoxHeight,
    color: rgb(0.985, 0.99, 1),
    borderColor,
    borderWidth: 1,
  });
  page.drawText("Key Metrics", {
    x: margin + 8,
    y: y - 12,
    size: 9,
    font: boldFont,
    color: textColor,
  });
  const statsLine1 = [
    `Drivers: ${summary.drivers}`,
    `Days total: ${summary.days_total}`,
    `KM total: ${formatMoneyInt(summary.km_total)}`,
    `CT total: ${summary.ct_total}`,
  ].join(" | ");
  const statsLine2 = [
    `Avg %KM: ${formatPercent(summary.pct_km_avg, 1)}`,
    `Avg %CT: ${formatPercent(summary.pct_ct_avg, 1)}`,
    `Bonus sum: ${formatMoney(summary.bonus_total)}`,
    `Penalty sum: ${formatMoney(summary.penalty_total)}`,
    `Final sum: ${formatMoney(summary.final_total)}`,
  ].join(" | ");
  page.drawText(statsLine1, {
    x: margin + 8,
    y: y - 26,
    size: 7,
    font,
    color: rgb(0.2, 0.28, 0.38),
  });
  page.drawText(statsLine2, {
    x: margin + 8,
    y: y - 39,
    size: 7,
    font,
    color: rgb(0.2, 0.28, 0.38),
  });
  y -= statsBoxHeight + 8;

  return pdfDoc.save();
}

async function buildBonusYearPdfWithPdfLib({
  userId, year, driverQuery, rows,
}) {
  const matrixRows = buildBonusYearMatrixRows(rows, year);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [1120, 595];
  const margin = 18;
  const rowHeight = 14;
  const textSize = 7;
  const textColor = rgb(0.08, 0.14, 0.24);
  const borderColor = rgb(0.74, 0.8, 0.9);
  const headerBg = rgb(0.93, 0.96, 1);
  const oddBg = rgb(0.985, 0.99, 1);
  const filterLabel = safeText(driverQuery, "").trim();

  const columns = [
    { key: "fahrer_id", label: "ID", width: 48, finalCol: false },
    { key: "fahrer_name", label: "Fahrer", width: 150, finalCol: false },
    ...Array.from({ length: 12 }, (_, idx) => ({
      key: `m${idx + 1}`,
      label: `${BONUS_MONTHS_SHORT[idx]} ${year} Final`,
      width: 66,
      finalCol: true,
    })),
    { key: "year_total", label: `${year} Total`, width: 74, finalCol: true },
  ];
  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const tableX = margin;

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawPageHeader = () => {
    page.drawText("Bonus (Year Overview)", {
      x: margin,
      y,
      size: 13,
      font: boldFont,
      color: textColor,
    });
    y -= 16;
    page.drawText(
      `Period: ${year} whole year | Filter: ${filterLabel || "all Fahrer"} | ${formatReportGeneratedLabel(userId)}`,
      {
        x: margin,
        y,
        size: 8,
        font,
        color: rgb(0.24, 0.3, 0.4),
      },
    );
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
      const label = fitTextToWidth(boldFont, col.label, textSize, col.width - 6);
      const labelWidth = measureTextWidth(boldFont, label, textSize);
      page.drawText(label, {
        x: x + ((col.width - labelWidth) / 2),
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
      const isFinal = Boolean(col.finalCol);
      const cellFont = isFinal ? boldFont : font;
      const cellSize = isFinal ? textSize + 1 : textSize;
      const rawValue = col.key === "fahrer_id"
        ? safeText(row?.fahrer_id, "")
        : col.key === "fahrer_name"
          ? safeText(row?.fahrer_name, "")
          : formatBonusCell(row?.[col.key], "money_int");
      const value = fitTextToWidth(cellFont, rawValue, cellSize, col.width - 8);
      const tx = x + ((col.width - measureTextWidth(cellFont, value, cellSize)) / 2);
      page.drawText(value, {
        x: tx,
        y: y - (isFinal ? 10 : 9),
        size: cellSize,
        font: cellFont,
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

  if (!matrixRows.length) {
    ensureSpace(20);
    page.drawText("No rows found for selected year/filter.", {
      x: margin,
      y: y - 10,
      size: 9,
      font,
      color: textColor,
    });
    return pdfDoc.save();
  }

  for (let idx = 0; idx < matrixRows.length; idx += 1) {
    ensureSpace(rowHeight + 2);
    drawRow(matrixRows[idx], idx);
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
    page.drawText(`${spec.subtitle} | ${formatReportGeneratedLabel(userId)}`, {
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
      const labelWidth = measureTextWidth(boldFont, label, maxTextSize);
      page.drawText(label, {
        x: x + Math.max(4, (col.width - labelWidth) / 2),
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
      const valueWidth = measureTextWidth(font, value, maxTextSize);
      page.drawText(value, {
        x: x + Math.max(4, (col.width - valueWidth) / 2),
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

async function buildFahrerListPdfWithPdfLib({ title, subtitle, rows, userId }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [842, 595];
  const margin = 22;
  const rowHeight = 15;
  const textSize = 8;
  const columns = [
    { key: "fahrer_id", label: "Fahrer-ID", width: 78 },
    { key: "fahrername", label: "Fahrername", width: 180 },
    { key: "firma", label: "Firma", width: 160 },
    { key: "telefonnummer", label: "Telefonnummer", width: 118 },
    { key: "lkw_typ", label: "Container / Planen", width: 140 },
  ];
  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const tableX = margin;
  const borderColor = rgb(0.74, 0.8, 0.9);
  const headerBg = rgb(0.93, 0.96, 1);
  const oddBg = rgb(0.985, 0.99, 1);
  const textColor = rgb(0.08, 0.14, 0.24);

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawHeader = () => {
    page.drawText(title, {
      x: margin,
      y,
      size: 13,
      font: boldFont,
      color: textColor,
    });
    y -= 16;
    page.drawText(`${subtitle} | Total drivers: ${rows.length} | ${formatReportGeneratedLabel(userId)}`, {
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
      const labelWidth = measureTextWidth(boldFont, label, textSize);
      page.drawText(label, {
        x: x + Math.max(4, (col.width - labelWidth) / 2),
        y: y - 9,
        size: textSize,
        font: boldFont,
        color: textColor,
      });
      x += col.width;
    }
    y -= rowHeight;
  };

  const nextPage = () => {
    page = pdfDoc.addPage(pageSize);
    y = page.getHeight() - margin;
    drawHeader();
    drawHeaderRow();
  };

  const ensureSpace = (needed) => {
    if (y - needed >= margin) return;
    nextPage();
  };

  drawHeader();
  drawHeaderRow();

  if (!rows.length) {
    page.drawText("No active drivers found.", {
      x: margin,
      y: y - 10,
      size: 9,
      font,
      color: textColor,
    });
    return pdfDoc.save();
  }

  rows.forEach((row, idx) => {
    ensureSpace(rowHeight + 2);
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
      const valueWidth = measureTextWidth(font, value, textSize);
      page.drawText(value, {
        x: x + Math.max(4, (col.width - valueWidth) / 2),
        y: y - 9,
        size: textSize,
        font,
        color: textColor,
      });
      x += col.width;
    }
    page.drawLine({
      start: { x: tableX, y: y - rowHeight + 2 },
      end: { x: tableX + tableWidth, y: y - rowHeight + 2 },
      thickness: 0.5,
      color: borderColor,
    });
    y -= rowHeight;
  });

  return pdfDoc.save();
}

function parseDdMmYyyy(value) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || "").trim());
  if (!m) return null;
  const ts = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isFinite(ts) ? ts : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function getBerlinDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: toIntSafe(map.year, date.getUTCFullYear()),
    month: toIntSafe(map.month, date.getUTCMonth() + 1),
    day: toIntSafe(map.day, date.getUTCDate()),
  };
}

function getBerlinTodayUtcTs(date = new Date()) {
  const parts = getBerlinDateParts(date);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function formatTagCount(value) {
  const n = Math.max(0, Math.round(toNumberSafe(value, 0)));
  return `${n} ${n === 1 ? "Tag" : "Tage"}`;
}

function countOverlapDays(startTs, endTs, rangeStartTs, rangeEndTs) {
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || !Number.isFinite(rangeStartTs) || !Number.isFinite(rangeEndTs)) {
    return 0;
  }
  const fromTs = Math.max(startTs, rangeStartTs);
  const toTs = Math.min(endTs, rangeEndTs);
  if (toTs < fromTs) return 0;
  return Math.floor((toTs - fromTs) / DAY_MS) + 1;
}

function countFahrerStatusDaysInRange(rows, targetCode, rangeStartTs, rangeEndTs) {
  let total = 0;
  for (const row of rows || []) {
    const code = normalizeFahrerWeekCode(row?.week_code);
    if (code !== targetCode || !toBoolish(row?.is_active_in_week)) continue;
    const weekStartTs = parseDdMmYyyy(row?.week_start);
    const weekEndTs = parseDdMmYyyy(row?.week_end);
    total += countOverlapDays(weekStartTs, weekEndTs, rangeStartTs, rangeEndTs);
  }
  return total;
}

function formatLkwMasterCell(value, kind = "text") {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (kind === "numberish") {
    const normalized = raw.replace(/\s+/g, "").replace(",", ".");
    const n = Number(normalized);
    if (Number.isFinite(n) && Math.abs(n) < 0.0000001) return "";
  }
  if (raw === "0" || raw === "0.0" || raw === "0.00") return "";
  return raw;
}

function formatYfDistanceKm(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const n = Number(raw.replace(/\s+/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return raw;
  return `${formatMoneyInt(n)} km`;
}

function formatYfHoursMinutes(totalMinutes) {
  const mins = Math.max(0, Number.parseInt(String(totalMinutes ?? "0"), 10) || 0);
  const hours = Math.floor(mins / 60);
  const restMinutes = mins % 60;
  return `${hours}:${String(restMinutes).padStart(2, "0")}`;
}

function formatYfDaysHours(totalMinutes) {
  const mins = Math.max(0, Number.parseInt(String(totalMinutes ?? "0"), 10) || 0);
  const hoursTotal = Math.floor(mins / 60);
  const days = Math.floor(hoursTotal / 24);
  const hours = hoursTotal % 24;
  return `${days} d ${hours} h`;
}

const YF_WEEKDAY_LABELS_DE = {
  monday: "Montag",
  tuesday: "Dienstag",
  wednesday: "Mittwoch",
  thursday: "Donnerstag",
  friday: "Freitag",
  saturday: "Samstag",
  sunday: "Sonntag",
};

function formatYfWeekdayDe(value) {
  const raw = safeText(value, "").trim();
  if (!raw) return "-";
  const key = raw.toLowerCase();
  return YF_WEEKDAY_LABELS_DE[key] || raw;
}

function formatSlashDateToDot(value) {
  const raw = safeText(value, "").trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (!m) return raw || "-";
  return `${m[1]}.${m[2]}.${m[3]}`;
}

function buildYfLkwMonthModel(rows = [], { year, month, lkwId }) {
  const WORKDAY_STRECKE_MIN_KM = 50;
  const ANOMALY_STRECKE_MAX_KM = 2000;
  const dailyRows = (rows || []).map((row) => {
    const streckeKm = toNumberSafe(row?.strecke_km, 0);
    const isWeekend = toBoolish(row?.is_weekend);
    const drivers = safeText(row?.drivers_final, "").trim();
    const isAnomaly = streckeKm < 0 || streckeKm > ANOMALY_STRECKE_MAX_KM;
    const isIdle = streckeKm >= 0 && streckeKm < WORKDAY_STRECKE_MIN_KM;
    return {
      reportDate: safeText(row?.report_date, ""),
      reportDateLabel: formatSlashDateToDot(row?.report_date),
      weekday: formatYfWeekdayDe(row?.dayweek),
      isWeekend,
      weekendLabel: isWeekend ? "Ja" : "Nein",
      streckeKm,
      streckeLabel: `${formatMoneyInt(streckeKm)} km`,
      driversFinal: drivers || "-",
      isAnomaly,
      worked: !isIdle,
      workedLabel: !isIdle ? "Ja" : "Nein",
      sourceRows: toIntSafe(row?.source_rows, 0),
    };
  });

  const calendarDays = dailyRows.length;
  const workDays = dailyRows.filter((row) => row.worked).length;
  const idleRows = dailyRows.filter((row) => !row.worked);
  const idleWeekend = idleRows.filter((row) => row.isWeekend).length;
  const idleWeekday = idleRows.filter((row) => !row.isWeekend).length;
  const totalKm = dailyRows.reduce((sum, row) => sum + row.streckeKm, 0);
  const avgKmPerWorkday = workDays > 0 ? (totalKm / workDays) : 0;
  const uniqueDrivers = new Set();
  for (const row of dailyRows) {
    const raw = safeText(row.driversFinal, "").trim();
    if (!raw || raw === "-") continue;
    for (const part of raw.split("/")) {
      const token = part.trim();
      if (token) uniqueDrivers.add(token);
    }
  }

  const anomalies = dailyRows
    .filter((row) => row.isAnomaly)
    .map((row) => `${row.reportDateLabel}: ${formatMoneyInt(row.streckeKm)} km`);

  const dataDays = dailyRows.filter((row) => row.sourceRows > 0).length;
  const driverLabel = uniqueDrivers.size
    ? Array.from(uniqueDrivers).join(", ")
    : "Kein Fahrer";

  return {
    lkwId: safeText(lkwId, "-"),
    year,
    month,
    periodLabel: `${monthNameDe(month)} ${year}`,
    driverLabel: driverLabel.length > 60 ? `${driverLabel.slice(0, 57)}...` : driverLabel,
    workdayThresholdKm: WORKDAY_STRECKE_MIN_KM,
    anomalyThresholdKm: ANOMALY_STRECKE_MAX_KM,
    dailyRows,
    idleRows,
    anomalies,
    summaryRows: [
      { metric: "Kalendertage", value: String(calendarDays) },
      { metric: `Arbeitstage (Anomalie oder Strecke >= ${WORKDAY_STRECKE_MIN_KM} km)`, value: String(workDays) },
      { metric: `Stillstandstage (0 <= Strecke < ${WORKDAY_STRECKE_MIN_KM} km)`, value: String(idleRows.length) },
      { metric: "Stillstand am Wochenende", value: String(idleWeekend) },
      { metric: "Stillstand werktags", value: String(idleWeekday) },
      { metric: "Tage mit Datenzeilen", value: String(dataDays) },
      { metric: "Tage mit Kilometer-Anomalie", value: String(anomalies.length) },
      { metric: "Gesamtkilometer (netto)", value: `${formatMoneyInt(totalKm)} km` },
      { metric: "Durchschnitt km pro Arbeitstag", value: `${formatMoneyInt(avgKmPerWorkday)} km` },
    ],
  };
}

async function buildYfDriverMonthPdfWithPdfLib({ userId, month, driverQuery, rows }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [842, 595];
  const margin = 24;
  const rowHeight = 18;
  const textSize = 8;
  const borderColor = rgb(0.74, 0.8, 0.9);
  const headerBg = rgb(0.93, 0.96, 1);
  const oddBg = rgb(0.985, 0.99, 1);
  const textColor = rgb(0.08, 0.14, 0.24);
  const columns = [
    { key: "month_index", label: "Month", width: 62 },
    { key: "fahrer_name", label: "Fahrer", width: 190 },
    { key: "distanz_km", label: "Distanz", width: 110 },
    { key: "aktivitaet_total_minutes", label: "Aktivitätsdauer", width: 120 },
    { key: "fahrzeit_total_minutes", label: "Fahrzeit", width: 100 },
    { key: "inaktivitaet_total_minutes", label: "Inaktivitätszeit", width: 120 },
  ];
  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const tableX = margin + ((pageSize[0] - (margin * 2) - tableWidth) / 2);

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawHeader = () => {
    page.drawText("Yellow Fox - Driver Month", {
      x: margin,
      y,
      size: 14,
      font: boldFont,
      color: textColor,
    });
    y -= 16;
    page.drawText(`Month: ${month} | Driver: ${safeText(driverQuery, "all")} | ${formatReportGeneratedLabel(userId)}`, {
      x: margin,
      y,
      size: 8,
      font,
      color: rgb(0.24, 0.3, 0.4),
    });
    y -= 14;

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
      const labelWidth = measureTextWidth(boldFont, label, textSize);
      page.drawText(label, {
        x: x + ((col.width - labelWidth) / 2),
        y: y - 11,
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
    drawHeader();
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

    const values = [
      String(row?.month_index ?? ""),
      safeText(row?.fahrer_name, ""),
      formatYfDistanceKm(row?.distanz_km),
      formatYfDaysHours(row?.aktivitaet_total_minutes),
      formatYfHoursMinutes(row?.fahrzeit_total_minutes),
      formatYfHoursMinutes(row?.inaktivitaet_total_minutes),
    ];

    let x = tableX;
    for (let i = 0; i < columns.length; i += 1) {
      const col = columns[i];
      const value = fitTextToWidth(font, values[i], textSize, col.width - 8);
      const valueWidth = measureTextWidth(font, value, textSize);
      page.drawText(value, {
        x: x + ((col.width - valueWidth) / 2),
        y: y - 11,
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

  drawHeader();
  if (!rows.length) {
    page.drawText("No rows found.", {
      x: margin,
      y: y - 10,
      size: 9,
      font,
      color: textColor,
    });
    return pdfDoc.save();
  }

  for (let idx = 0; idx < rows.length; idx += 1) {
    ensureSpace(rowHeight + 2);
    drawRow(rows[idx], idx);
  }

  return pdfDoc.save();
}

async function buildYfLkwWeekPdfWithPdfLib({ userId, year, week, lkwId, rows }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [1040, 595];
  const margin = 22;
  const rowHeight = 17;
  const textSize = 7;
  const borderColor = rgb(0.74, 0.8, 0.9);
  const headerBg = rgb(0.93, 0.96, 1);
  const oddBg = rgb(0.985, 0.99, 1);
  const textColor = rgb(0.08, 0.14, 0.24);
  const columns = [
    { key: "report_year", label: "Year", width: 54 },
    { key: "month_name", label: "Month", width: 72 },
    { key: "iso_week", label: "Week", width: 52 },
    { key: "lkw_nummer", label: "LKW", width: 88 },
    { key: "report_date", label: "Datum", width: 76 },
    { key: "dayweek", label: "dayweek", width: 74 },
    { key: "strecke_km", label: "Strecke", width: 72 },
    { key: "km_start", label: "Kilometerstand Start", width: 120 },
    { key: "km_end", label: "Kilometerstand Ende", width: 118 },
    { key: "drivers_final", label: "Drivers final", width: 156 },
  ];
  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const tableX = margin + ((pageSize[0] - (margin * 2) - tableWidth) / 2);

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawHeader = () => {
    page.drawText("Yellow Fox - LKW Week", {
      x: margin,
      y,
      size: 14,
      font: boldFont,
      color: textColor,
    });
    y -= 16;
    page.drawText(`Year: ${year} | Week: ${week} | LKW: ${safeText(lkwId, "all")} | ${formatReportGeneratedLabel(userId)}`, {
      x: margin,
      y,
      size: 8,
      font,
      color: rgb(0.24, 0.3, 0.4),
    });
    y -= 14;

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
      const labelWidth = measureTextWidth(boldFont, label, textSize);
      page.drawText(label, {
        x: x + ((col.width - labelWidth) / 2),
        y: y - 10,
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
    drawHeader();
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

    const values = [
      safeText(row?.report_year, ""),
      safeText(row?.month_name, ""),
      safeText(row?.iso_week, ""),
      safeText(row?.lkw_nummer, ""),
      safeText(row?.report_date, ""),
      safeText(row?.dayweek, ""),
      formatMoneyInt(row?.strecke_km),
      formatMoneyInt(row?.km_start),
      formatMoneyInt(row?.km_end),
      safeText(row?.drivers_final, ""),
    ];

    let x = tableX;
    for (let i = 0; i < columns.length; i += 1) {
      const col = columns[i];
      const value = fitTextToWidth(font, values[i], textSize, col.width - 8);
      const valueWidth = measureTextWidth(font, value, textSize);
      page.drawText(value, {
        x: x + ((col.width - valueWidth) / 2),
        y: y - 10,
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

  drawHeader();
  if (!rows.length) {
    page.drawText("No rows found.", {
      x: margin,
      y: y - 10,
      size: 9,
      font,
      color: textColor,
    });
    return pdfDoc.save();
  }

  for (let idx = 0; idx < rows.length; idx += 1) {
    ensureSpace(rowHeight + 2);
    drawRow(rows[idx], idx);
  }

  return pdfDoc.save();
}

async function buildYfLkwMonthPdfWithPdfLib({ userId, year, month, lkwId, rows }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const model = buildYfLkwMonthModel(rows, { year, month, lkwId });

  const pageSize = [1040, 595];
  const margin = 24;
  const textColor = rgb(0.08, 0.14, 0.24);
  const mutedColor = rgb(0.24, 0.3, 0.4);
  const borderColor = rgb(0.74, 0.8, 0.9);
  const headerBg = rgb(0.18, 0.36, 0.57);
  const oddBg = rgb(0.985, 0.99, 1);
  const noteWarnBg = rgb(1, 0.95, 0.94);
  const noteWarnBorder = rgb(0.91, 0.76, 0.73);
  const noteInfoBg = rgb(0.92, 0.97, 0.9);
  const noteInfoBorder = rgb(0.72, 0.84, 0.68);

  const drawTable = ({
    page,
    startX,
    startY,
    columns,
    rows: tableRows,
    rowHeight = 18,
    textSize = 8,
    includeHeader = true,
  }) => {
    const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);
    let y = startY;

    if (includeHeader) {
      page.drawRectangle({
        x: startX,
        y: y - rowHeight,
        width: tableWidth,
        height: rowHeight,
        color: headerBg,
        borderColor,
        borderWidth: 1,
      });

      let x = startX;
      for (const col of columns) {
        const label = fitTextToWidth(boldFont, col.label, textSize, col.width - 8);
        const labelWidth = measureTextWidth(boldFont, label, textSize);
        page.drawText(label, {
          x: x + ((col.width - labelWidth) / 2),
          y: y - rowHeight + ((rowHeight - textSize) / 2) + 2,
          size: textSize,
          font: boldFont,
          color: rgb(1, 1, 1),
        });
        x += col.width;
        if (x < startX + tableWidth - 0.5) {
          page.drawLine({
            start: { x, y: y - rowHeight },
            end: { x, y },
            thickness: 0.8,
            color: borderColor,
          });
        }
      }
      y -= rowHeight;
    }

    for (let rowIdx = 0; rowIdx < tableRows.length; rowIdx += 1) {
      if (rowIdx % 2 === 1) {
        page.drawRectangle({
          x: startX,
          y: y - rowHeight,
          width: tableWidth,
          height: rowHeight,
          color: oddBg,
        });
      }

      let cellX = startX;
      for (let colIdx = 0; colIdx < columns.length; colIdx += 1) {
        const col = columns[colIdx];
        const raw = safeText(tableRows[rowIdx][colIdx], "");
        const value = fitTextToWidth(font, raw, textSize, col.width - 8);
        const valueWidth = measureTextWidth(font, value, textSize);
        page.drawText(value, {
          x: cellX + ((col.width - valueWidth) / 2),
          y: y - rowHeight + ((rowHeight - textSize) / 2) + 2,
          size: textSize,
          font,
          color: textColor,
        });
        cellX += col.width;
        if (cellX < startX + tableWidth - 0.5) {
          page.drawLine({
            start: { x: cellX, y: y - rowHeight },
            end: { x: cellX, y },
            thickness: 0.5,
            color: borderColor,
          });
        }
      }
      page.drawLine({
        start: { x: startX, y: y - rowHeight },
        end: { x: startX + tableWidth, y: y - rowHeight },
        thickness: 0.5,
        color: borderColor,
      });
      y -= rowHeight;
    }

    return { bottomY: y, tableWidth };
  };

  const drawNote = ({ page, x, yTop, width, height, bgColor, border, title, body }) => {
    const titleSize = 10;
    const bodySize = 9;
    const lineGap = 4;
    const contentHeight = titleSize + lineGap + bodySize;
    const contentTop = yTop - ((height - contentHeight) / 2);
    const bodyText = fitTextToWidth(font, body, bodySize, width - 24);

    page.drawRectangle({
      x,
      y: yTop - height,
      width,
      height,
      color: bgColor,
      borderColor: border,
      borderWidth: 1,
    });
    page.drawText(title, {
      x: x + 12,
      y: contentTop - titleSize,
      size: titleSize,
      font: boldFont,
      color: textColor,
    });
    page.drawText(bodyText, {
      x: x + 12,
      y: contentTop - titleSize - lineGap - bodySize,
      size: bodySize,
      font,
      color: textColor,
    });
  };

  const summaryPage = pdfDoc.addPage(pageSize);
  let y = pageSize[1] - margin;

  summaryPage.drawText("Fahrzeugbericht", {
    x: margin,
    y,
    size: 22,
    font: boldFont,
    color: rgb(0.12, 0.34, 0.58),
  });
  y -= 24;
  summaryPage.drawText(`Fahrzeug: ${model.lkwId}`, {
    x: margin,
    y,
    size: 12,
    font: boldFont,
    color: textColor,
  });
  summaryPage.drawText(`Fahrer: ${model.driverLabel}`, {
    x: margin + 180,
    y,
    size: 12,
    font: boldFont,
    color: textColor,
  });
  summaryPage.drawText(`Zeitraum: ${model.periodLabel}`, {
    x: margin + 460,
    y,
    size: 12,
    font: boldFont,
    color: textColor,
  });
  y -= 24;

  const summaryColumns = [
    { label: "Kennzahl", width: 330 },
    { label: "Wert", width: 130 },
  ];
  const idleColumns = [
    { label: "Datum", width: 110 },
    { label: "Wochentag", width: 132 },
    { label: "Wochenende", width: 110 },
  ];
  const summaryRows = model.summaryRows.map((row) => [row.metric, row.value]);
  const idleRows = (model.idleRows.length ? model.idleRows : [{
    reportDateLabel: "-",
    weekday: "-",
    weekendLabel: "-",
  }]).map((row) => [row.reportDateLabel, row.weekday, row.weekendLabel]);

  const summaryTable = drawTable({
    page: summaryPage,
    startX: margin,
    startY: y,
    columns: summaryColumns,
    rows: summaryRows,
    rowHeight: 19,
    textSize: 9,
  });
  const idleTableWidth = idleColumns.reduce((sum, col) => sum + col.width, 0);
  const idleX = pageSize[0] - margin - idleTableWidth;
  const idleTable = drawTable({
    page: summaryPage,
    startX: idleX,
    startY: y,
    columns: idleColumns,
    rows: idleRows,
    rowHeight: 19,
    textSize: 9,
  });

  const noteTop = Math.min(summaryTable.bottomY, idleTable.bottomY) - 18;
  drawNote({
    page: summaryPage,
    x: margin,
    yTop: noteTop,
    width: pageSize[0] - (margin * 2),
    height: 34,
    bgColor: noteInfoBg,
    border: noteInfoBorder,
    title: "Regel",
    body: `Nur 0 bis ${model.workdayThresholdKm - 1} km gelten als Stillstand. Kilometerwerte < 0 oder > ${model.anomalyThresholdKm} km werden als Anomalie markiert und als Arbeitstag gezaehlt.`,
  });

  if (model.anomalies.length) {
    drawNote({
      page: summaryPage,
      x: margin,
      yTop: noteTop - 46,
      width: pageSize[0] - (margin * 2),
      height: 34,
      bgColor: noteWarnBg,
      border: noteWarnBorder,
      title: "Datenhinweis",
      body: model.anomalies.join(" | "),
    });
  }

  summaryPage.drawText(formatReportGeneratedLabel(userId), {
    x: margin,
    y: margin - 2,
    size: 8,
    font,
    color: mutedColor,
  });

  const dailyColumns = [
    { label: "Datum", width: 90 },
    { label: "Wochentag", width: 118 },
    { label: "Fahrer", width: 280 },
    { label: "Strecke", width: 96 },
    { label: "Arbeitstag", width: 96 },
    { label: "Wochenende", width: 102 },
  ];
  const dailyWidth = dailyColumns.reduce((sum, col) => sum + col.width, 0);
  const dailyX = margin + ((pageSize[0] - (margin * 2) - dailyWidth) / 2);
  const dailyRows = model.dailyRows.map((row) => [
    row.reportDateLabel,
    row.weekday,
    row.driversFinal,
    row.streckeLabel,
    row.workedLabel,
    row.weekendLabel,
  ]);

  let dailyPage = pdfDoc.addPage(pageSize);
  let dailyY = pageSize[1] - margin;
  const dailyRowHeight = 16;
  const dailyTextSize = 8;

  const drawDailyHeader = () => {
    dailyPage.drawText("Tagesuebersicht", {
      x: margin,
      y: dailyY,
      size: 16,
      font: boldFont,
      color: textColor,
    });
    dailyY -= 16;
    dailyPage.drawText(`Fahrzeug: ${model.lkwId} | Zeitraum: ${model.periodLabel}`, {
      x: margin,
      y: dailyY,
      size: 8,
      font,
      color: mutedColor,
    });
    dailyY -= 16;
    drawTable({
      page: dailyPage,
      startX: dailyX,
      startY: dailyY,
      columns: dailyColumns,
      rows: [],
      rowHeight: dailyRowHeight,
      textSize: dailyTextSize,
      includeHeader: true,
    });
    dailyY -= dailyRowHeight;
  };

  const ensureDailySpace = () => {
    if (dailyY - dailyRowHeight >= margin) return;
    dailyPage = pdfDoc.addPage(pageSize);
    dailyY = pageSize[1] - margin;
    drawDailyHeader();
  };

  drawDailyHeader();
  for (let idx = 0; idx < dailyRows.length; idx += 1) {
    ensureDailySpace();
    drawTable({
      page: dailyPage,
      startX: dailyX,
      startY: dailyY,
      columns: dailyColumns,
      rows: [dailyRows[idx]],
      rowHeight: dailyRowHeight,
      textSize: dailyTextSize,
      includeHeader: false,
    });
    dailyY -= dailyRowHeight;
  }

  return pdfDoc.save();
}

async function buildDieselLkwCardPdfWithPdfLib({ userId, rows, lkwId }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [842, 595];
  const margin = 28;
  const rowHeight = 24;
  const textSize = 10;
  const borderColor = rgb(0.74, 0.8, 0.9);
  const headerBg = rgb(0.93, 0.96, 1);
  const oddBg = rgb(0.985, 0.99, 1);
  const textColor = rgb(0.08, 0.14, 0.24);
  const columns = resolveAutoColumns({
    columns: [
      { key: "lkw_id", label: "LKW-ID", width: "auto", min_width: 90, max_width: 130 },
      { key: "lkw_nummer", label: "LKW-Nummer", width: "auto", min_width: 120, max_width: 170 },
      { key: "dkv_card", label: "DKV Card", width: "auto", min_width: 150, max_width: 180 },
      { key: "shell_card", label: "Shell Card", width: "auto", min_width: 160, max_width: 190 },
      { key: "tankpool_card", label: "Tankpool Card", width: "auto", min_width: 130, max_width: 160 },
    ],
    rows,
    font,
    size: textSize,
    maxTableWidth: pageSize[0] - (margin * 2),
  });
  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const tableX = margin + ((pageSize[0] - (margin * 2) - tableWidth) / 2);

  const page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;

  page.drawText("Diesel - LKW Karte", {
    x: margin,
    y,
    size: 16,
    font: boldFont,
    color: textColor,
  });
  y -= 18;
  page.drawText(`Sheet LKW | LKW-ID: ${safeText(lkwId, "-")} | ${formatReportGeneratedLabel(userId)}`, {
    x: margin,
    y,
    size: 9,
    font,
    color: rgb(0.24, 0.3, 0.4),
  });
  y -= 28;

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
    const labelWidth = measureTextWidth(boldFont, label, textSize);
    page.drawText(label, {
      x: x + ((col.width - labelWidth) / 2),
      y: y - 15,
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

  if (!Array.isArray(rows) || rows.length === 0) {
    page.drawText("No rows found.", {
      x: margin,
      y: y - 20,
      size: 11,
      font,
      color: textColor,
    });
    return pdfDoc.save();
  }

  const row = rows[0] || {};
  page.drawRectangle({
    x: tableX,
    y: y - rowHeight + 2,
    width: tableWidth,
    height: rowHeight,
    color: oddBg,
    borderColor,
    borderWidth: 1,
  });

  x = tableX;
  for (const col of columns) {
    const value = fitTextToWidth(font, formatLkwMasterCell(row?.[col.key], "text"), textSize, col.width - 8);
    const valueWidth = measureTextWidth(font, value, textSize);
    page.drawText(value, {
      x: x + ((col.width - valueWidth) / 2),
      y: y - 15,
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

  return pdfDoc.save();
}

async function buildLkwMasterPdfWithPdfLib({ userId, rows, title }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [1190, 595];
  const margin = 18;
  const rowHeight = 15;
  const textSize = 7;
  const tableMaxWidth = pageSize[0] - (margin * 2);
  const columns = resolveAutoColumns({
    columns: [
      { key: "lkw_id", label: "LKW-ID", width: "auto", min_width: 48, max_width: 72 },
      { key: "lkw_nummer", label: "LKW-Nummer", width: "auto", min_width: 78, max_width: 110 },
      { key: "marke_modell", label: "Marke/Modell", width: "auto", min_width: 84, max_width: 128 },
      { key: "lkw_typ", label: "LKW-Typ", width: "auto", min_width: 62, max_width: 96 },
      { key: "baujahr", label: "Baujahr", width: "auto", min_width: 54, max_width: 74 },
      { key: "firma", label: "Firma", width: "auto", min_width: 72, max_width: 112 },
      { key: "eigentum", label: "Eigentum", width: "auto", min_width: 74, max_width: 104 },
      { key: "status", label: "Status", width: "auto", min_width: 58, max_width: 86 },
      { key: "datum_verkauft", label: "Datum verkauft", width: "auto", min_width: 78, max_width: 102 },
      { key: "telefonnummer", label: "Telefonnummer", width: "auto", min_width: 98, max_width: 126 },
      { key: "km_2025", label: "KM 2025", width: "auto", min_width: 60, max_width: 88 },
      { key: "km_2026", label: "KM 2026", width: "auto", min_width: 60, max_width: 88 },
      { key: "naechste_tuev", label: "Nächste TÜV", width: "auto", min_width: 76, max_width: 102 },
      { key: "versicherung_bis", label: "Versicherung bis", width: "auto", min_width: 90, max_width: 118 },
      { key: "wartung_total", label: "Gesamtkosten für die Wartung", width: "auto", min_width: 112, max_width: 156 },
      { key: "cost_2023", label: "2023", width: "auto", min_width: 50, max_width: 72 },
      { key: "cost_2024", label: "2024", width: "auto", min_width: 50, max_width: 72 },
      { key: "cost_2025", label: "2025", width: "auto", min_width: 50, max_width: 72 },
      { key: "cost_2026", label: "2026", width: "auto", min_width: 50, max_width: 72 },
    ],
    rows,
    font,
    size: textSize,
    maxTableWidth: tableMaxWidth,
  });
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const tableX = margin;
  const borderColor = rgb(0.74, 0.8, 0.9);
  const headerBg = rgb(0.93, 0.96, 1);
  const oddBg = rgb(0.985, 0.99, 1);
  const soldBg = rgb(0.84, 0.84, 0.84);
  const containerBg = rgb(0.94, 0.88, 0.8);
  const planenBg = rgb(0.91, 0.87, 0.96);
  const textColor = rgb(0.08, 0.14, 0.24);
  const nowUtc = Date.now();

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawPageHeader = () => {
    page.drawText(title, {
      x: margin,
      y,
      size: 13,
      font: boldFont,
      color: textColor,
    });
    y -= 16;
    page.drawText(`Sheet LKW | ${formatReportGeneratedLabel(userId)}`, {
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
      const labelWidth = measureTextWidth(boldFont, label, textSize);
      page.drawText(label, {
        x: x + ((col.width - labelWidth) / 2),
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

  const getRowFill = (row, idx) => {
    const status = safeText(row?.status, "").trim().toLowerCase();
    const saleTs = parseDdMmYyyy(row?.datum_verkauft);
    if (status === "verkauft" && (saleTs === null || saleTs <= nowUtc)) return soldBg;
    const type = safeText(row?.lkw_typ, "").trim().toLowerCase();
    if (type === "container") return containerBg;
    if (type === "planen") return planenBg;
    return idx % 2 === 1 ? oddBg : null;
  };

  const drawRow = (row, idx) => {
    const fill = getRowFill(row, idx);
    if (fill) {
      page.drawRectangle({
        x: tableX,
        y: y - rowHeight + 2,
        width: tableWidth,
        height: rowHeight,
        color: fill,
      });
    }

    let x = tableX;
    for (const col of columns) {
      const value = fitTextToWidth(
        font,
        formatLkwMasterCell(row?.[col.key], ["km_2025", "km_2026", "wartung_total", "cost_2023", "cost_2024", "cost_2025", "cost_2026"].includes(col.key) ? "numberish" : "text"),
        textSize,
        col.width - 8,
      );
      const tx = x + ((col.width - measureTextWidth(font, value, textSize)) / 2);
      page.drawText(value, {
        x: tx,
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

function normalizeFahrerWeekCode(value) {
  const raw = safeText(value, "").trim().toUpperCase();
  if (raw === "U") return "U";
  if (raw === "K" || raw === "К") return "K";
  return "";
}

function buildFahrerWeekSpans(rows, targetCode) {
  const grouped = new Map();
  for (const row of rows || []) {
    const code = normalizeFahrerWeekCode(row?.week_code);
    if (code !== targetCode || !toBoolish(row?.is_active_in_week)) continue;
    const key = `${safeText(row?.fahrer_id, "")}__${safeText(row?.fahrer_name, "")}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({
      report_year: toIntSafe(row?.report_year, 0),
      iso_week: toIntSafe(row?.iso_week, 0),
      week_start: safeText(row?.week_start, ""),
      week_end: safeText(row?.week_end, ""),
      fahrer_id: safeText(row?.fahrer_id, ""),
      fahrer_name: safeText(row?.fahrer_name, ""),
      company_name: safeText(row?.company_name, ""),
    });
  }

  const spans = [];
  for (const items of grouped.values()) {
    items.sort((a, b) => (a.report_year - b.report_year) || (a.iso_week - b.iso_week));
    let start = null;
    let prev = null;
    for (const item of items) {
      const contiguous = prev
        && item.report_year === prev.report_year
        && item.iso_week === prev.iso_week + 1;
      if (!start || !contiguous) {
        if (start && prev) {
          spans.push({
            fahrer_id: start.fahrer_id,
            fahrer_name: start.fahrer_name,
            company_name: start.company_name,
            weeks_label: start.iso_week === prev.iso_week ? `W${pad2(start.iso_week)}` : `W${pad2(start.iso_week)}-${pad2(prev.iso_week)}`,
            from_label: start.week_start,
            to_label: prev.week_end,
          });
        }
        start = item;
      }
      prev = item;
    }
    if (start && prev) {
      spans.push({
        fahrer_id: start.fahrer_id,
        fahrer_name: start.fahrer_name,
        company_name: start.company_name,
        weeks_label: start.iso_week === prev.iso_week ? `W${pad2(start.iso_week)}` : `W${pad2(start.iso_week)}-${pad2(prev.iso_week)}`,
        from_label: start.week_start,
        to_label: prev.week_end,
      });
    }
  }

  spans.sort((a, b) => {
    const idDiff = safeText(a.fahrer_id, "").localeCompare(safeText(b.fahrer_id, ""));
    if (idDiff) return idDiff;
    return safeText(a.from_label, "").localeCompare(safeText(b.from_label, ""));
  });
  return spans;
}

async function buildFahrerAllPdfWithPdfLib({ userId, reportYear, masterRows, weeklyRows, weeklySummaryRows }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [842, 595];
  const margin = 22;
  const textColor = rgb(0.08, 0.14, 0.24);
  const mutedColor = rgb(0.24, 0.3, 0.4);
  const borderColor = rgb(0.74, 0.8, 0.9);
  const headerBg = rgb(0.93, 0.96, 1);
  const oddBg = rgb(0.985, 0.99, 1);
  const inactiveBg = rgb(0.9, 0.9, 0.9);

  const effectiveYear = toIntSafe(reportYear, new Date().getUTCFullYear());
  const vacationSpans = buildFahrerWeekSpans(weeklyRows, "U");
  const sickSpans = buildFahrerWeekSpans(weeklyRows, "K");

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawPageHeader = () => {
    page.drawText(`Fahrer - Daten aller Fahrer (${effectiveYear})`, {
      x: margin,
      y,
      size: 13,
      font: boldFont,
      color: textColor,
    });
    y -= 16;
    page.drawText(`Sheet Fahrer | ${formatReportGeneratedLabel(userId)}`, {
      x: margin,
      y,
      size: 8,
      font,
      color: mutedColor,
    });
    y -= 14;
  };

  const drawSectionTitle = (title) => {
    page.drawText(title, {
      x: margin,
      y,
      size: 10,
      font: boldFont,
      color: textColor,
    });
    y -= 14;
  };

  const drawCenteredTable = (title, columns, rows, opts = {}) => {
    const rowHeight = opts.rowHeight || 14;
    const textSize = opts.textSize || 8;
    const tableX = margin;
    const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);
    const rowFill = typeof opts.rowFill === "function" ? opts.rowFill : null;

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
        const labelWidth = measureTextWidth(boldFont, label, textSize);
        page.drawText(label, {
          x: x + Math.max(4, (col.width - labelWidth) / 2),
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

    const nextPage = () => {
      page = pdfDoc.addPage(pageSize);
      y = page.getHeight() - margin;
      drawPageHeader();
      drawSectionTitle(title);
      drawHeaderRow();
    };

    const ensureSpace = (needed) => {
      if (y - needed >= margin) return;
      nextPage();
    };

    ensureSpace(26);
    drawSectionTitle(title);
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
      y -= 18;
      return;
    }

    rows.forEach((row, idx) => {
      ensureSpace(rowHeight + 2);
      const fill = rowFill ? rowFill(row, idx) : (idx % 2 === 1 ? oddBg : null);
      if (fill) {
        page.drawRectangle({
          x: tableX,
          y: y - rowHeight + 2,
          width: tableWidth,
          height: rowHeight,
          color: fill,
        });
      }
      let x = tableX;
      for (const col of columns) {
        const value = fitTextToWidth(font, safeText(row?.[col.key], ""), textSize, col.width - 8);
        const valueWidth = measureTextWidth(font, value, textSize);
        page.drawText(value, {
          x: x + Math.max(4, (col.width - valueWidth) / 2),
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
    });

    y -= 8;
  };

  drawPageHeader();

  drawCenteredTable(
    "Stammdaten",
    [
      { key: "fahrer_id", label: "Fahrer-ID", width: 58 },
      { key: "fahrername", label: "Fahrername", width: 128 },
      { key: "firma", label: "Firma", width: 98 },
      { key: "telefonnummer", label: "Telefonnummer", width: 96 },
      { key: "lkw_typ", label: "LKW-Typ", width: 64 },
      { key: "arbeitsplan", label: "Arbeitsplan", width: 68 },
      { key: "status_entlassen", label: "Status entlassen", width: 80 },
      { key: "datum_entlassen", label: "Datum entlassen", width: 84 },
      { key: "urlaub_gesamt", label: `Urlaub gesamt ${effectiveYear}`, width: 64 },
      { key: "krankheitstage", label: `Krankheitstage ${effectiveYear}`, width: 66 },
    ],
    masterRows,
    {
      rowFill: (row, idx) => safeText(row?.status_entlassen, "").trim() ? inactiveBg : (idx % 2 === 1 ? oddBg : null),
    },
  );

  drawCenteredTable(
    "Urlaub nach Wochen",
    [
      { key: "fahrer_id", label: "Fahrer-ID", width: 66 },
      { key: "fahrer_name", label: "Fahrername", width: 180 },
      { key: "weeks_label", label: "Urlaubswochen", width: 90 },
      { key: "from_label", label: "Von", width: 90 },
      { key: "to_label", label: "Bis", width: 90 },
    ],
    vacationSpans,
  );

  drawCenteredTable(
    "Krankheit nach Wochen",
    [
      { key: "fahrer_id", label: "Fahrer-ID", width: 66 },
      { key: "fahrer_name", label: "Fahrername", width: 180 },
      { key: "weeks_label", label: "Krankheitswochen", width: 90 },
      { key: "from_label", label: "Von", width: 90 },
      { key: "to_label", label: "Bis", width: 90 },
    ],
    sickSpans,
  );

  const summaryRows = (weeklySummaryRows || []).map((row) => ({
    iso_week: `W${pad2(toIntSafe(row?.iso_week, 0))}`,
    week_start: safeText(row?.week_start, ""),
    week_end: safeText(row?.week_end, ""),
    total_drivers: String(toIntSafe(row?.total_drivers, 0)),
    vacation_drivers: String(toIntSafe(row?.vacation_drivers, 0)),
    sick_drivers: String(toIntSafe(row?.sick_drivers, 0)),
  }));

  drawCenteredTable(
    "Woechentliche Uebersicht",
    [
      { key: "iso_week", label: "Woche", width: 70 },
      { key: "week_start", label: "Von", width: 96 },
      { key: "week_end", label: "Bis", width: 96 },
      { key: "total_drivers", label: "Fahrer gesamt", width: 92 },
      { key: "vacation_drivers", label: "Im Urlaub", width: 82 },
      { key: "sick_drivers", label: "Krank", width: 72 },
    ],
    summaryRows,
  );

  return pdfDoc.save();
}

async function buildFahrerCardPdfWithPdfLib({ userId, reportYear, driver, weeklyRows, monthlyRows }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [842, 595];
  const margin = 28;
  const textColor = rgb(0.08, 0.13, 0.22);
  const mutedColor = rgb(0.34, 0.4, 0.5);
  const accentColor = rgb(0.14, 0.38, 0.68);
  const headerBg = rgb(0.88, 0.93, 0.98);
  const cardBg = rgb(0.97, 0.985, 1);
  const tableHeadBg = rgb(0.12, 0.32, 0.52);
  const tableHeadText = rgb(1, 1, 1);
  const borderColor = rgb(0.72, 0.79, 0.88);
  const oddBg = rgb(0.965, 0.98, 1);

  const effectiveYear = toIntSafe(reportYear, new Date().getUTCFullYear());
  const vacationSpans = buildFahrerWeekSpans(weeklyRows, "U");
  const sickSpans = buildFahrerWeekSpans(weeklyRows, "K");
  const berlinTodayParts = getBerlinDateParts();
  const currentBerlinYear = berlinTodayParts.year;
  const currentBerlinMonth = berlinTodayParts.month;
  const monthsCovered = effectiveYear < currentBerlinYear ? 12 : (effectiveYear === currentBerlinYear ? currentBerlinMonth : 0);
  const yearMonthlyRows = (monthlyRows || []).filter((row) => toIntSafe(row?.report_year, effectiveYear) === effectiveYear);
  const ytdMonthlyRows = yearMonthlyRows.filter((row) => {
    const monthIndex = toIntSafe(row?.month_index, 0);
    return monthIndex >= 1 && monthIndex <= monthsCovered;
  });
  const totalKm = ytdMonthlyRows.reduce((sum, row) => sum + toNumberSafe(row?.bonus_km, 0), 0);
  const avgKmPerMonth = monthsCovered > 0 ? (totalKm / monthsCovered) : 0;
  const totalCt = ytdMonthlyRows.reduce((sum, row) => sum + toIntSafe(row?.ct, 0), 0);
  const avgCtPerMonth = monthsCovered > 0 ? (totalCt / monthsCovered) : 0;
  const totalBonus = ytdMonthlyRows.reduce((sum, row) => sum + toNumberSafe(row?.final, 0), 0);
  const workedDaysYtd = ytdMonthlyRows.reduce((sum, row) => sum + toIntSafe(row?.days, 0), 0);
  const yearStartTs = Date.UTC(effectiveYear, 0, 1);
  const yearEndTs = Date.UTC(effectiveYear, 11, 31);
  const statusRangeEndTs = effectiveYear < currentBerlinYear
    ? yearEndTs
    : (effectiveYear === currentBerlinYear ? Math.min(getBerlinTodayUtcTs(), yearEndTs) : (yearStartTs - DAY_MS));
  const vacationDaysYtd = statusRangeEndTs >= yearStartTs
    ? countFahrerStatusDaysInRange(weeklyRows, "U", yearStartTs, statusRangeEndTs)
    : 0;
  const sickDaysYtd = statusRangeEndTs >= yearStartTs
    ? countFahrerStatusDaysInRange(weeklyRows, "K", yearStartTs, statusRangeEndTs)
    : 0;

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - margin;

  const drawText = (text, x, yy, size, usedFont = font, color = textColor, maxWidth = null) => {
    const value = maxWidth ? fitTextToWidth(usedFont, safeText(text, ""), size, maxWidth) : safeText(text, "");
    page.drawText(value, { x, y: yy, size, font: usedFont, color });
  };

  const centerText = (text, x, yy, width, size, usedFont = font, color = textColor) => {
    const value = fitTextToWidth(usedFont, safeText(text, ""), size, Math.max(10, width - 8));
    const w = measureTextWidth(usedFont, value, size);
    page.drawText(value, { x: x + Math.max(4, (width - w) / 2), y: yy, size, font: usedFont, color });
  };

  const drawHeader = () => {
    page.drawRectangle({
      x: margin,
      y: y - 78,
      width: page.getWidth() - margin * 2,
      height: 78,
      color: headerBg,
      borderColor,
      borderWidth: 1,
    });
    drawText("Fahrerkarte", margin + 18, y - 26, 20, boldFont, accentColor);
    drawText(`${safeText(driver?.fahrer_id, "")} - ${safeText(driver?.fahrername, "")}`, margin + 18, y - 50, 15, boldFont, textColor, 360);
    drawText(`Firma: ${safeText(driver?.firma, "-")}`, margin + 430, y - 26, 10, boldFont, textColor, 250);
    drawText(`Arbeitsplan: ${safeText(driver?.arbeitsplan, "-")}`, margin + 430, y - 43, 10, font, mutedColor, 250);
    drawText(formatReportGeneratedLabel(userId), margin + 430, y - 60, 8, font, mutedColor, 320);
    y -= 96;
  };

  const ensureSpace = (needed) => {
    if (y - needed >= margin) return;
    page = pdfDoc.addPage(pageSize);
    y = page.getHeight() - margin;
  };

  const drawMetricCards = () => {
    const metricPrimarySize = 10.8;
    const metricSecondarySize = 6.8;
    const metricLabelSize = 7.2;
    const cards = [
      {
        label: `Urlaub ${effectiveYear}`,
        lines: [
          { text: formatTagCount(driver?.urlaub_gesamt), size: metricPrimarySize, font: boldFont, color: accentColor },
          { text: "", size: metricSecondarySize, font, color: mutedColor },
        ],
      },
      {
        label: `Krankheit ${effectiveYear}`,
        lines: [
          { text: formatTagCount(driver?.krankheitstage), size: metricPrimarySize, font: boldFont, color: accentColor },
          { text: "", size: metricSecondarySize, font, color: mutedColor },
        ],
      },
      {
        label: `KM ${effectiveYear}`,
        lines: [
          { text: `${formatMoneyInt(totalKm)} km`, size: metricPrimarySize, font: boldFont, color: accentColor },
          { text: `Avg ${formatMoneyInt(avgKmPerMonth)} km/Monat`, size: metricSecondarySize, font, color: mutedColor },
        ],
      },
      {
        label: `Container ${effectiveYear}`,
        lines: [
          { text: `${formatMoneyInt(totalCt)} CT`, size: metricPrimarySize, font: boldFont, color: accentColor },
          { text: `Avg ${formatMoneyInt(avgCtPerMonth)} CT/Monat`, size: metricSecondarySize, font, color: mutedColor },
        ],
      },
      {
        label: `Bonus ${effectiveYear}`,
        lines: [
          { text: `${formatMoneyInt(totalBonus)} Euro`, size: metricPrimarySize, font: boldFont, color: accentColor },
          { text: "", size: metricSecondarySize, font, color: mutedColor },
        ],
      },
      {
        label: `Work time ${effectiveYear}`,
        lines: [
          { text: `${formatTagCount(workedDaysYtd)} gearbeitet`, size: metricPrimarySize, font: boldFont, color: accentColor },
          { text: `${formatTagCount(vacationDaysYtd)} Urlaub | ${formatTagCount(sickDaysYtd)} krank`, size: metricSecondarySize, font, color: mutedColor },
        ],
      },
    ];
    const gap = 8;
    const width = (page.getWidth() - margin * 2 - gap * (cards.length - 1)) / cards.length;
    const cardHeight = 72;
    cards.forEach((card, idx) => {
      const x = margin + idx * (width + gap);
      page.drawRectangle({ x, y: y - cardHeight, width, height: cardHeight, color: cardBg, borderColor, borderWidth: 1 });
      const lines = Array.isArray(card.lines) && card.lines.length ? card.lines : [{ text: safeText(card.value, ""), size: metricPrimarySize, font: boldFont, color: accentColor }];
      let lineY = y - 20;
      for (const line of lines) {
        centerText(line.text, x, lineY, width, line.size || 12, line.font || font, line.color || textColor);
        lineY -= 11;
      }
      centerText(card.label, x, y - 61, width, metricLabelSize, font, mutedColor);
    });
    y -= 88;
  };

  const drawSectionTitle = (title) => {
    const titleBandHeight = 22;
    const titleTopGap = 8;
    ensureSpace(titleBandHeight + titleTopGap);
    y -= titleTopGap;
    const textY = y - ((titleBandHeight - 11) / 2) - 1;
    drawText(title, margin, textY, 11, boldFont, textColor);
    y -= titleBandHeight;
  };

  const drawKeyValueGrid = (title, items, columns = 4) => {
    drawSectionTitle(title);
    const colGap = 8;
    const rowH = 30;
    const colW = (page.getWidth() - margin * 2 - colGap * (columns - 1)) / columns;
    for (let idx = 0; idx < items.length; idx += 1) {
      if (idx % columns === 0) ensureSpace(rowH + 6);
      const col = idx % columns;
      const x = margin + col * (colW + colGap);
      const item = items[idx];
      page.drawRectangle({ x, y: y - rowH + 2, width: colW, height: rowH, color: cardBg, borderColor, borderWidth: 0.7 });
      centerText(item.label, x, y - 10, colW, 7, boldFont, mutedColor);
      centerText(item.value || "-", x, y - 24, colW, 8, font, textColor);
      if (col === columns - 1 || idx === items.length - 1) y -= rowH + 6;
    }
    y -= 2;
  };

  const drawTable = (title, columns, rows, opts = {}) => {
    const rowH = opts.rowHeight || 16;
    const textSize = opts.textSize || 8;
    const tableW = columns.reduce((sum, col) => sum + col.width, 0);
    const tableX = margin;
    const drawHeaderRow = () => {
      page.drawRectangle({ x: tableX, y: y - rowH + 2, width: tableW, height: rowH, color: tableHeadBg });
      let x = tableX;
      for (const col of columns) {
        centerText(col.label, x, y - 10, col.width, textSize, boldFont, tableHeadText);
        x += col.width;
      }
      y -= rowH;
    };
    drawSectionTitle(title);
    drawHeaderRow();
    if (!rows || rows.length === 0) {
      ensureSpace(rowH + 4);
      page.drawRectangle({ x: tableX, y: y - rowH + 2, width: tableW, height: rowH, color: oddBg, borderColor, borderWidth: 0.5 });
      centerText("Keine Daten", tableX, y - 10, tableW, textSize, font, mutedColor);
      y -= rowH + 8;
      return;
    }
    rows.forEach((row, idx) => {
      const beforeY = y;
      ensureSpace(rowH + 4);
      if ((idx > 0 && y > page.getHeight() - margin - 20) || y > beforeY) drawHeaderRow();
      page.drawRectangle({
        x: tableX,
        y: y - rowH + 2,
        width: tableW,
        height: rowH,
        color: idx % 2 ? oddBg : rgb(1, 1, 1),
        borderColor,
        borderWidth: 0.45,
      });
      let x = tableX;
      for (const col of columns) {
        centerText(row[col.key], x, y - 10, col.width, textSize, font, textColor);
        x += col.width;
      }
      y -= rowH;
    });
    y -= 10;
  };

  drawHeader();
  drawMetricCards();

  drawKeyValueGrid("Stammdaten A-W", [
    { label: "Fahrer-ID", value: driver?.fahrer_id },
    { label: "Fahrername", value: driver?.fahrername },
    { label: "Firma", value: driver?.firma },
    { label: "Telefonnummer", value: driver?.telefonnummer },
    { label: "Fuehrerschein", value: driver?.fuehrerschein },
    { label: "LKW-Typ", value: driver?.lkw_typ },
    { label: "Arbeitsplan", value: driver?.arbeitsplan },
    { label: "Status entlassen", value: driver?.status_entlassen },
    { label: "Datum entlassen", value: driver?.datum_entlassen },
    { label: "Pass gueltig bis", value: driver?.pass_gueltig_bis },
    { label: "95 Code bis", value: driver?.code_95_bis },
    { label: "Wohnungen bis", value: driver?.wohnungen_bis },
    { label: "Eintrittsdatum", value: driver?.eintrittsdatum },
    { label: "Gesundheitsbuch bis", value: driver?.gesundheitsbuch_bis },
    { label: "ESDK bis", value: driver?.esdk_bis },
    { label: "A1 Formular bis", value: driver?.a1_bis },
    { label: "DE Anhang bis", value: driver?.de_anhang_bis },
    { label: "28 Tage Bestellung bis", value: driver?.bestellung_28_tage_bis },
    { label: "IMIS", value: driver?.imis },
    { label: "Geburtsdatum", value: driver?.geburtsdatum },
    { label: "ADR-Schein", value: driver?.adr_schein },
    { label: "ADR gueltig bis", value: driver?.adr_bis },
    { label: "FS gueltig bis", value: driver?.fs_bis },
  ], 4);

  const spanRows = [
    ...vacationSpans.map((row) => ({ type: "Urlaub", weeks: row.weeks_label, from: row.from_label, to: row.to_label })),
    ...sickSpans.map((row) => ({ type: "Krank", weeks: row.weeks_label, from: row.from_label, to: row.to_label })),
  ];
  drawTable(
    "Urlaub und Krankheit nach Wochen",
    [
      { key: "type", label: "Typ", width: 120 },
      { key: "weeks", label: "Wochen", width: 140 },
      { key: "from", label: "Von", width: 120 },
      { key: "to", label: "Bis", width: 120 },
    ],
    spanRows,
  );

  const monthlyTableRows = yearMonthlyRows.map((row) => ({
    period: `${safeText(row?.report_year, "")}/${pad2(toIntSafe(row?.month_index, 0))}`,
    month: safeText(row?.month_name, ""),
    lkw: safeText(row?.lkw_list, "-"),
    days: formatTagCount(row?.days),
    km: `${formatMoneyInt(row?.bonus_km)} km`,
    ct: formatMoneyInt(row?.ct),
    bonus: formatMoneyInt(row?.final),
  }));
  drawTable(
    "Monatliche Leistung: KM, LKW und Bonus",
    [
      { key: "period", label: "Periode", width: 70 },
      { key: "month", label: "Monat", width: 86 },
      { key: "lkw", label: "LKW", width: 240 },
      { key: "days", label: "Days", width: 82 },
      { key: "km", label: "KM", width: 90 },
      { key: "ct", label: "CT", width: 62 },
      { key: "bonus", label: "Bonus", width: 90 },
    ],
    monthlyTableRows,
    { textSize: 7.5, rowHeight: 17 },
  );

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
  let user = null;
  try {
    const userJson = parsed.params.get("user") || "";
    if (userJson) {
      user = JSON.parse(userJson);
      const id = Number.parseInt(String(user?.id ?? ""), 10);
      if (Number.isFinite(id) && id > 0) userId = id;
    }
  } catch {
    return { ok: false, error: "Invalid user payload in initData" };
  }

  if (!userId) {
    return { ok: false, error: "User id is missing in initData" };
  }

  return { ok: true, userId, user };
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
    user: auth.user,
    reportUserLabel: formatReportUserLabel(auth.user, auth.userId),
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
    } else if (reportType === "einnahmen") {
      filename = makeEinnahmenFilename();
    } else if (reportType === "einnahmen_firm") {
      filename = makeEinnahmenFirmFilename();
    } else if (reportType === "diesel") {
      filename = makeDieselFilename();
    } else if (reportType === "diesel_lkw_card") {
      filename = makeDieselLkwCardFilename(params?.lkw_id);
    } else if (reportType === "yf_driver_month") {
      filename = makeYfDriverMonthFilename(params?.month, params?.driver_query);
    } else if (reportType === "yf_lkw_week") {
      filename = makeYfLkwWeekFilename(params?.year, params?.week, params?.lkw_id);
    } else if (reportType === "fahrer_all") {
      filename = makeFahrerAllFilename(params?.report_year);
    } else if (reportType === "bonus") {
      filename = makeBonusFilename(params?.year, params?.month);
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

function parseHistoryDeletePayload(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }

  const initData = String(body.initData || "").trim();
  const deleteAll = toBoolish(body.delete_all);
  const idsInput = Array.isArray(body.ids) ? body.ids : [];
  const ids = [];
  const seen = new Set();

  for (const raw of idsInput) {
    const id = toIntSafe(raw, 0);
    if (id <= 0 || seen.has(id)) continue;
    ids.push(id);
    seen.add(id);
    if (ids.length >= 200) break;
  }

  if (!initData) {
    return { ok: false, status: 400, error: "Missing initData" };
  }
  if (!deleteAll && ids.length === 0) {
    return { ok: false, status: 400, error: "Provide ids or set delete_all=true" };
  }

  return { ok: true, initData, deleteAll, ids };
}

async function handleHistoryDelete(request, env) {
  const body = await parseJsonBody(request);
  const parsed = parseHistoryDeletePayload(body);
  if (!parsed.ok) {
    return json({ ok: false, error: parsed.error }, parsed.status, { "Cache-Control": "no-store" });
  }

  const authz = await authorizeUserByInitData(parsed.initData, env);
  if (!authz.ok) {
    return json({ ok: false, error: authz.error }, authz.status, { "Cache-Control": "no-store" });
  }

  try {
    let result;
    if (parsed.deleteAll) {
      result = await queryNeon(
        authz.dbConnectionString,
        `
          DELETE FROM reports_log
          WHERE user_id = $1
            AND status = 'success'
          RETURNING id
        `,
        [authz.userId],
      );
    } else {
      const placeholders = parsed.ids.map((_, idx) => `$${idx + 2}`).join(", ");
      result = await queryNeon(
        authz.dbConnectionString,
        `
          DELETE FROM reports_log
          WHERE user_id = $1
            AND status = 'success'
            AND id IN (${placeholders})
          RETURNING id
        `,
        [authz.userId, ...parsed.ids],
      );
    }

    const deletedIds = (result?.rows || []).map((r) => toIntSafe(r.id, 0)).filter((id) => id > 0);
    return json(
      {
        ok: true,
        deleted_count: deletedIds.length,
        deleted_ids: deletedIds,
      },
      200,
      { "Cache-Control": "no-store" },
    );
  } catch (err) {
    return json(
      {
        ok: false,
        error: "Failed to delete history entries",
        details: String(err?.message || err || "unknown error"),
      },
      500,
      { "Cache-Control": "no-store" },
    );
  }
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
      userId: authz.reportUserLabel,
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
      subtitle: formatReportGeneratedLabel(authz.reportUserLabel),
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

  if (reportType === "diesel") {
    return { ok: true, reportType };
  }

  if (reportType === "diesel_lkw_card") {
    const lkwId = String(body.lkw_id || "").trim().slice(0, 40);
    if (!lkwId) {
      return { ok: false, status: 400, error: "Missing lkw_id" };
    }
    return { ok: true, reportType, lkwId };
  }

  if (reportType === "yf_driver_month") {
    const month = Number.parseInt(String(body.month ?? ""), 10);
    const driverQuery = String(body.driver_query || "").trim().slice(0, 120);
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      return { ok: false, status: 400, error: "Invalid month" };
    }
    if (!driverQuery) {
      return { ok: false, status: 400, error: "Missing driver_query" };
    }
    return { ok: true, reportType, month, driverQuery };
  }

  if (reportType === "yf_lkw_week") {
    const year = Number.parseInt(String(body.year ?? ""), 10);
    const week = Number.parseInt(String(body.week ?? ""), 10);
    const lkwId = String(body.lkw_id || "").trim().slice(0, 80);
    if (!Number.isFinite(year) || !Number.isFinite(week) || year < 2025 || year > 2035 || week < 1 || week > 53) {
      return { ok: false, status: 400, error: "Invalid year/week" };
    }
    if (!lkwId) {
      return { ok: false, status: 400, error: "Missing lkw_id" };
    }
    return { ok: true, reportType, year, week, lkwId };
  }

  if (reportType === "yf_lkw_month") {
    const year = Number.parseInt(String(body.year ?? ""), 10);
    const month = Number.parseInt(String(body.month ?? ""), 10);
    const lkwId = String(body.lkw_id || "").trim().slice(0, 80);
    if (!Number.isFinite(year) || !Number.isFinite(month) || year < 2025 || year > 2035 || month < 1 || month > 12) {
      return { ok: false, status: 400, error: "Invalid year/month" };
    }
    if (!lkwId) {
      return { ok: false, status: 400, error: "Missing lkw_id" };
    }
    return { ok: true, reportType, year, month, lkwId };
  }

  if (reportType === "bonus") {
    const year = Number.parseInt(String(body.year ?? ""), 10);
    const period = String(body.period || "month").trim().toLowerCase() === "year" ? "year" : "month";
    const month = Number.parseInt(String(body.month ?? ""), 10);
    const yearParam = report.params.find((p) => p.id === "year");
    const monthParam = report.params.find((p) => p.id === "month");
    const minYear = toInt(yearParam?.min, 2020);
    const maxYear = toInt(yearParam?.max, 2100);
    const minMonth = toInt(monthParam?.min, 1);
    const maxMonth = toInt(monthParam?.max, 12);
    const driverQuery = String(body.driver_query || "").trim().slice(0, 120);
    if (!Number.isFinite(year)) {
      return { ok: false, status: 400, error: "Invalid year/month" };
    }
    if (!(year >= minYear && year <= maxYear)) {
      return { ok: false, status: 400, error: "Year/month out of range" };
    }
    if (period === "year") {
      return { ok: true, reportType, year, month: 0, period, driverQuery };
    }
    if (!Number.isFinite(month)) {
      return { ok: false, status: 400, error: "Invalid year/month" };
    }
    if (!(month >= minMonth && month <= maxMonth)) {
      return { ok: false, status: 400, error: "Year/month out of range" };
    }
    return { ok: true, reportType, year, month, period, driverQuery };
  }

  if (reportType === "bonus_firma_month") {
    const year = Number.parseInt(String(body.year ?? ""), 10);
    const month = Number.parseInt(String(body.month ?? ""), 10);
    const firmaName = String(body.firma_name || "").trim().slice(0, 160);
    if (!Number.isFinite(year) || year < 2025 || year > 2035 || !Number.isFinite(month) || month < 1 || month > 12) {
      return { ok: false, status: 400, error: "Invalid year/month" };
    }
    if (!firmaName) {
      return { ok: false, status: 400, error: "Missing firma_name" };
    }
    return { ok: true, reportType, year, month, firmaName };
  }

  if (reportType === "lkw_single") {
    const lkwId = String(body.lkw_id || "").trim().slice(0, 40);
    if (!lkwId) {
      return { ok: false, status: 400, error: "Missing lkw_id" };
    }
    return { ok: true, reportType, lkwId };
  }

  if (reportType === "lkw_all") {
    return { ok: true, reportType };
  }

  if (reportType === "fahrer_all") {
    return { ok: true, reportType };
  }

  if (reportType === "fahrer_card") {
    const driverQuery = String(body.driver_query || "").trim().slice(0, 140);
    if (!driverQuery) {
      return { ok: false, status: 400, error: "Missing driver_query" };
    }
    return { ok: true, reportType, driverQuery };
  }

  if (reportType === "fahrer_type") {
    const lkwTypeRaw = String(body.lkw_type || "").trim();
    const normalized = lkwTypeRaw.toLowerCase();
    if (normalized !== "container" && normalized !== "planen") {
      return { ok: false, status: 400, error: "Missing or invalid lkw_type" };
    }
    return { ok: true, reportType, lkwType: normalized === "container" ? "Container" : "Planen" };
  }

  if (reportType === "fahrer_firma") {
    const firmaName = String(body.firma_name || "").trim().slice(0, 160);
    if (!firmaName) {
      return { ok: false, status: 400, error: "Missing firma_name" };
    }
    return { ok: true, reportType, firmaName };
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
  const reportUserLabel = formatReportUserLabel(auth.user, auth.userId);

  if (
    valid.reportType !== "bericht"
    && valid.reportType !== "data_plan"
    && valid.reportType !== "data_data"
    && valid.reportType !== "einnahmen"
    && valid.reportType !== "einnahmen_firm"
    && valid.reportType !== "diesel"
    && valid.reportType !== "diesel_lkw_card"
    && valid.reportType !== "yf_driver_month"
    && valid.reportType !== "yf_lkw_week"
    && valid.reportType !== "yf_lkw_month"
    && valid.reportType !== "bonus"
    && valid.reportType !== "bonus_firma_month"
    && valid.reportType !== "lkw_single"
    && valid.reportType !== "lkw_all"
    && valid.reportType !== "fahrer_all"
    && valid.reportType !== "fahrer_card"
    && valid.reportType !== "fahrer_type"
    && valid.reportType !== "fahrer_firma"
  ) {
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
  let outputKey = valid.reportType;

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
        userId: reportUserLabel,
        rows,
        weekSummaries,
      });
    } catch (err) {
      // Keep generation available even if pdf-lib fails on edge runtime.
      pdfEngine = "legacy-fallback";
      const lines = formatBerichtLines(rows, weekSummaries);
      pdfBytes = buildSimplePdf({
        title: `Bericht (Trucks by Company) - ${valid.year}/W${pad2(valid.week)}`,
        subtitle: formatReportGeneratedLabel(reportUserLabel),
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
        userId: reportUserLabel,
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
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: 842,
        pageHeight: 595,
      });
    }
  } else if (valid.reportType === "data_data") {
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
        userId: reportUserLabel,
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
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: 842,
        pageHeight: 595,
      });
    }
  } else if (valid.reportType === "einnahmen") {
    let rows;
    try {
      const result = await queryNeon(dbConnectionString, EINNAHMEN_MONTHLY_SQL, []);
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

    filename = makeEinnahmenFilename();
    outputKey = `einnahmen:${formatUtcDateStamp(new Date())}`;
    try {
      pdfBytes = await buildEinnahmenPdfWithPdfLib({
        userId: reportUserLabel,
        rows,
      });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const matrixRows = buildEinnahmenMatrixRows(rows);
      const lines = [];
      lines.push("Monat | Nahverkehr | Logistics | Gesamt");
      lines.push("-".repeat(100));
      for (const row of matrixRows) {
        lines.push(
          [
            safeText(row.month_name, ""),
            formatEinnahmenCell(row.nahverkehr),
            formatEinnahmenCell(row.logistics),
            formatEinnahmenCell(row.gesamt),
          ].join(" | "),
        );
      }
      pdfBytes = buildSimplePdf({
        title: "Einnahmen (Bericht_Dispo)",
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: 842,
        pageHeight: 595,
      });
    }
  } else if (valid.reportType === "einnahmen_firm") {
    let rows;
    try {
      const result = await queryNeon(dbConnectionString, EINNAHMEN_FIRM_SQL, []);
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

    filename = makeEinnahmenFirmFilename();
    outputKey = `einnahmen_firm:${formatUtcDateStamp(new Date())}`;
    try {
      pdfBytes = await buildEinnahmenFirmPdfWithPdfLib({
        userId: reportUserLabel,
        rows,
      });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const matrixRows = buildEinnahmenFirmRows(rows);
      const lines = [];
      lines.push("Firm | Januar | Februar | Maerz | April | Mai | Juni | Juli | August | September | Oktober | November | Dezember | Total");
      lines.push("-".repeat(220));
      for (const row of matrixRows) {
        lines.push(
          [
            safeText(row.firm_name, ""),
            formatEinnahmenFirmCell(row.january),
            formatEinnahmenFirmCell(row.february),
            formatEinnahmenFirmCell(row.march),
            formatEinnahmenFirmCell(row.april),
            formatEinnahmenFirmCell(row.may),
            formatEinnahmenFirmCell(row.june),
            formatEinnahmenFirmCell(row.july),
            formatEinnahmenFirmCell(row.august),
            formatEinnahmenFirmCell(row.september),
            formatEinnahmenFirmCell(row.october),
            formatEinnahmenFirmCell(row.november),
            formatEinnahmenFirmCell(row.december),
            formatEinnahmenFirmCell(row.total),
          ].join(" | "),
        );
      }
      pdfBytes = buildSimplePdf({
        title: "Einnahmen nach Firma (Bericht_Dispo BS:CF)",
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: 1190,
        pageHeight: 842,
      });
    }
  } else if (valid.reportType === "diesel") {
    let rows;
    try {
      const result = await queryNeon(dbConnectionString, DIESEL_MONTHLY_SQL, []);
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

    filename = makeDieselFilename();
    outputKey = `diesel:${formatUtcDateStamp(new Date())}`;
    try {
      pdfBytes = await buildDieselPdfWithPdfLib({
        userId: reportUserLabel,
        rows,
      });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const snapshotRows = buildDieselSnapshotRows(rows);
      const lines = [];
      lines.push("Page 1: Diesel A1:R26");
      lines.push("-".repeat(80));
      for (const row of snapshotRows) {
        const p = row.raw_payload || {};
        lines.push(
          [
            formatDieselSnapshotCell(getDieselRawCell(p, 1), "month"),
            formatDieselSnapshotCell(getDieselRawCell(p, 2), "year"),
            formatDieselSnapshotCell(getDieselRawCell(p, 3), "int"),
            formatDieselSnapshotCell(getDieselRawCell(p, 5), "int"),
            formatDieselSnapshotCell(getDieselRawCell(p, 6), "int"),
            formatDieselSnapshotCell(getDieselRawCell(p, 7), "int"),
            formatDieselSnapshotCell(getDieselRawCell(p, 8), "int"),
            formatDieselSnapshotCell(getDieselRawCell(p, 10), "int"),
            formatDieselSnapshotCell(getDieselRawCell(p, 11), "int"),
            formatDieselSnapshotCell(getDieselRawCell(p, 12), "int"),
            formatDieselSnapshotCell(getDieselRawCell(p, 13), "int"),
            formatDieselSnapshotCell(getDieselRawCell(p, 15), "decimal2"),
            formatDieselSnapshotCell(getDieselRawCell(p, 16), "decimal2"),
            formatDieselSnapshotCell(getDieselRawCell(p, 17), "decimal2"),
            formatDieselSnapshotCell(getDieselRawCell(p, 18), "decimal2"),
          ].join(" | "),
        );
      }
      lines.push("");
      lines.push("Page 2: Diesel T1:AL26");
      lines.push("-".repeat(80));
      for (const row of snapshotRows) {
        const p = row.raw_payload || {};
        lines.push(
          [
            formatDieselSnapshotCell(getDieselRawCell(p, 20), "month"),
            formatDieselSnapshotCell(getDieselRawCell(p, 21), "year"),
            formatDieselSnapshotCell(getDieselRawCell(p, 22), "int"),
            formatDieselSnapshotCell(getDieselRawCell(p, 24), "int"),
            formatDieselSnapshotCell(getDieselRawCell(p, 26), "int"),
            formatDieselSnapshotCell(getDieselRawCell(p, 28), "decimal2"),
            formatDieselSnapshotCell(getDieselRawCell(p, 30), "percent1"),
            formatDieselSnapshotCell(getDieselRawCell(p, 32), "decimal2"),
            formatDieselSnapshotCell(getDieselRawCell(p, 33), "int"),
            formatDieselSnapshotCell(getDieselRawCell(p, 34), "int"),
            formatDieselSnapshotCell(getDieselRawCell(p, 35), "percent2"),
            formatDieselSnapshotCell(getDieselRawCell(p, 37), "decimal2"),
            formatDieselSnapshotCell(getDieselRawCell(p, 38), "signed2"),
          ].join(" | "),
        );
      }
      pdfBytes = buildSimplePdf({
        title: "Diesel Snapshot",
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: 842,
        pageHeight: 595,
      });
    }
  } else if (valid.reportType === "diesel_lkw_card") {
    let rows;
    const filterLkwId = safeText(valid.lkwId, "").trim();
    try {
      const result = await queryNeon(
        dbConnectionString,
        DIESEL_LKW_CARD_SQL,
        [filterLkwId],
      );
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

    filename = makeDieselLkwCardFilename(filterLkwId);
    outputKey = `diesel_lkw_card:${filterLkwId}`;
    try {
      pdfBytes = await buildDieselLkwCardPdfWithPdfLib({
        userId: reportUserLabel,
        rows,
        lkwId: filterLkwId,
      });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const lines = [];
      lines.push("LKW-ID | LKW-Nummer | DKV Card | Shell Card | Tankpool Card");
      lines.push("-".repeat(110));
      for (const row of rows) {
        lines.push(
          [
            safeText(row.lkw_id, ""),
            safeText(row.lkw_nummer, ""),
            formatLkwMasterCell(row.dkv_card, "text"),
            formatLkwMasterCell(row.shell_card, "text"),
            formatLkwMasterCell(row.tankpool_card, "text"),
          ].join(" | "),
        );
      }
      pdfBytes = buildSimplePdf({
        title: `Diesel - LKW Karte ${filterLkwId}`,
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: 842,
        pageHeight: 595,
      });
    }
  } else if (valid.reportType === "yf_driver_month") {
    let rows;
    const driverQuery = safeText(valid.driverQuery, "").trim();
    const likeQuery = driverQuery ? `%${driverQuery}%` : "";
    try {
      const result = await queryNeon(
        dbConnectionString,
        YF_DRIVER_MONTH_SQL,
        [valid.month, driverQuery, likeQuery],
      );
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

    filename = makeYfDriverMonthFilename(valid.month, driverQuery);
    outputKey = `yf_driver_month:${pad2(valid.month)}:${driverQuery}`;
    try {
      pdfBytes = await buildYfDriverMonthPdfWithPdfLib({
        userId: reportUserLabel,
        month: valid.month,
        driverQuery,
        rows,
      });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const lines = [];
      lines.push("Month | Fahrer | Distanz | Aktivitaetsdauer | Fahrzeit | Inaktivitaetszeit");
      lines.push("-".repeat(120));
      for (const row of rows) {
        lines.push([
          safeText(row.month_index, ""),
          safeText(row.fahrer_name, ""),
          formatYfDistanceKm(row.distanz_km),
          formatYfDaysHours(row.aktivitaet_total_minutes),
          formatYfHoursMinutes(row.fahrzeit_total_minutes),
          formatYfHoursMinutes(row.inaktivitaet_total_minutes),
        ].join(" | "));
      }
      pdfBytes = buildSimplePdf({
        title: `Yellow Fox - Driver Month ${pad2(valid.month)}`,
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: 842,
        pageHeight: 595,
      });
    }
  } else if (valid.reportType === "yf_lkw_week") {
    let rows;
    const lkwId = safeText(valid.lkwId, "").trim();
    try {
      const result = await queryNeon(
        dbConnectionString,
        YF_LKW_WEEK_SQL,
        [valid.year, valid.week, lkwId],
      );
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

    filename = makeYfLkwWeekFilename(valid.year, valid.week, lkwId);
    outputKey = `yf_lkw_week:${valid.year}:W${pad2(valid.week)}:${lkwId}`;
    try {
      pdfBytes = await buildYfLkwWeekPdfWithPdfLib({
        userId: reportUserLabel,
        year: valid.year,
        week: valid.week,
        lkwId,
        rows,
      });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const lines = [];
      lines.push("Year | Month | Week | LKW | Datum | dayweek | Strecke | Kilometerstand Start | Kilometerstand Ende | Drivers final");
      lines.push("-".repeat(170));
      for (const row of rows) {
        lines.push([
          safeText(row.report_year, ""),
          safeText(row.month_name, ""),
          safeText(row.iso_week, ""),
          safeText(row.lkw_nummer, ""),
          safeText(row.report_date, ""),
          safeText(row.dayweek, ""),
          formatMoneyInt(row.strecke_km),
          formatMoneyInt(row.km_start),
          formatMoneyInt(row.km_end),
          safeText(row.drivers_final, ""),
        ].join(" | "));
      }
      pdfBytes = buildSimplePdf({
        title: `Yellow Fox - LKW Week ${valid.year}/W${pad2(valid.week)}`,
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: 1040,
        pageHeight: 595,
      });
    }
  } else if (valid.reportType === "yf_lkw_month") {
    let rows;
    const lkwId = safeText(valid.lkwId, "").trim();
    try {
      const result = await queryNeon(
        dbConnectionString,
        YF_LKW_MONTH_SQL,
        [valid.year, valid.month, lkwId],
      );
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

    filename = makeYfLkwMonthFilename(valid.year, valid.month, lkwId);
    outputKey = `yf_lkw_month:${valid.year}:${pad2(valid.month)}:${lkwId}`;
    try {
      pdfBytes = await buildYfLkwMonthPdfWithPdfLib({
        userId: reportUserLabel,
        year: valid.year,
        month: valid.month,
        lkwId,
        rows,
      });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const lines = [];
      lines.push("Date | dayweek | Drivers final | Strecke | Workday | Weekend");
      lines.push("-".repeat(120));
      for (const row of rows) {
        const streckeKm = toNumberSafe(row.strecke_km, 0);
        const isIdle = streckeKm >= 0 && streckeKm < 50;
        lines.push([
          formatSlashDateToDot(row.report_date),
          formatYfWeekdayDe(row.dayweek),
          safeText(row.drivers_final, "-"),
          `${formatMoneyInt(streckeKm)} km`,
          !isIdle ? "Ja" : "Nein",
          toBoolish(row.is_weekend) ? "Ja" : "Nein",
        ].join(" | "));
      }
      pdfBytes = buildSimplePdf({
        title: `Yellow Fox - LKW Month ${valid.year}/${pad2(valid.month)}`,
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: 1040,
        pageHeight: 595,
      });
    }
  } else if (valid.reportType === "lkw_single" || valid.reportType === "lkw_all") {
    let rows;
    const filterLkwId = valid.reportType === "lkw_single" ? safeText(valid.lkwId, "").trim() : "";
    try {
      const result = await queryNeon(
        dbConnectionString,
        LKW_MASTER_SQL,
        [filterLkwId],
      );
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

    filename = valid.reportType === "lkw_single"
      ? `lkw_${filterLkwId}.pdf`
      : `lkw_all_${formatUtcDateStamp(new Date())}.pdf`;
    outputKey = valid.reportType === "lkw_single"
      ? `lkw_single:${filterLkwId}`
      : `lkw_all:${formatUtcDateStamp(new Date())}`;
    try {
      pdfBytes = await buildLkwMasterPdfWithPdfLib({
        userId: reportUserLabel,
        rows,
        title: valid.reportType === "lkw_single" ? `LKW ${filterLkwId}` : "LKW All",
      });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const lines = [];
      lines.push("LKW-ID | LKW-Nummer | Marke/Modell | LKW-Typ | Baujahr | Firma | Eigentum | Status | Datum verkauft | Telefonnummer | KM 2025 | KM 2026 | Nächste TÜV | Versicherung bis | Gesamtkosten für die Wartung | 2023 | 2024 | 2025 | 2026");
      lines.push("-".repeat(280));
      for (const row of rows) {
        lines.push(
          [
            safeText(row.lkw_id, ""),
            safeText(row.lkw_nummer, ""),
            safeText(row.marke_modell, ""),
            safeText(row.lkw_typ, ""),
            safeText(row.baujahr, ""),
            safeText(row.firma, ""),
            safeText(row.eigentum, ""),
            safeText(row.status, ""),
            safeText(row.datum_verkauft, ""),
            safeText(row.telefonnummer, ""),
            formatLkwMasterCell(row.km_2025, "numberish"),
            formatLkwMasterCell(row.km_2026, "numberish"),
            safeText(row.naechste_tuev, ""),
            safeText(row.versicherung_bis, ""),
            formatLkwMasterCell(row.wartung_total, "numberish"),
            formatLkwMasterCell(row.cost_2023, "numberish"),
            formatLkwMasterCell(row.cost_2024, "numberish"),
            formatLkwMasterCell(row.cost_2025, "numberish"),
            formatLkwMasterCell(row.cost_2026, "numberish"),
          ].join(" | "),
        );
      }
      pdfBytes = buildSimplePdf({
        title: valid.reportType === "lkw_single" ? `LKW ${filterLkwId}` : "LKW All",
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: 1190,
        pageHeight: 595,
      });
    }
  } else if (valid.reportType === "fahrer_all") {
    let masterRows;
    let weeklyRows;
    let weeklySummaryRows;
    let fahrerReportYear = new Date().getUTCFullYear();
    try {
      const [masterResult, weeklyResult, summaryResult] = await Promise.all([
        queryNeon(dbConnectionString, FAHRER_ALL_SQL, []),
        queryNeon(dbConnectionString, FAHRER_WEEKLY_STATUS_SQL, []),
        queryNeon(dbConnectionString, FAHRER_WEEKLY_SUMMARY_SQL, []),
      ]);
      masterRows = masterResult.rows || [];
      weeklyRows = weeklyResult.rows || [];
      weeklySummaryRows = summaryResult.rows || [];
      fahrerReportYear = toIntSafe(masterRows?.[0]?.report_year, toIntSafe(weeklyRows?.[0]?.report_year, fahrerReportYear));
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

    filename = makeFahrerAllFilename(fahrerReportYear);
    outputKey = `fahrer_all:${fahrerReportYear}`;
    try {
      pdfBytes = await buildFahrerAllPdfWithPdfLib({
        userId: reportUserLabel,
        reportYear: fahrerReportYear,
        masterRows,
        weeklyRows,
        weeklySummaryRows,
      });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const lines = [];
      lines.push("Fahrer-ID | Fahrername | Firma | Telefonnummer | LKW-Typ | Arbeitsplan | Status entlassen | Datum entlassen | Urlaub gesamt | Krankheitstage");
      lines.push("-".repeat(180));
      for (const row of masterRows) {
        lines.push([
          safeText(row?.fahrer_id, ""),
          safeText(row?.fahrername, ""),
          safeText(row?.firma, ""),
          safeText(row?.telefonnummer, ""),
          safeText(row?.lkw_typ, ""),
          safeText(row?.arbeitsplan, ""),
          safeText(row?.status_entlassen, ""),
          safeText(row?.datum_entlassen, ""),
          safeText(row?.urlaub_gesamt, ""),
          safeText(row?.krankheitstage, ""),
        ].join(" | "));
      }
      lines.push("");
      lines.push("Woche | Von | Bis | Fahrer gesamt | Urlaub | Krank");
      lines.push("-".repeat(90));
      for (const row of weeklySummaryRows) {
        lines.push([
          `W${pad2(toIntSafe(row?.iso_week, 0))}`,
          safeText(row?.week_start, ""),
          safeText(row?.week_end, ""),
          String(toIntSafe(row?.total_drivers, 0)),
          String(toIntSafe(row?.vacation_drivers, 0)),
          String(toIntSafe(row?.sick_drivers, 0)),
        ].join(" | "));
      }
      pdfBytes = buildSimplePdf({
        title: `Fahrer - Daten aller Fahrer (${fahrerReportYear})`,
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: 1040,
        pageHeight: 595,
      });
    }
    valid.reportYear = fahrerReportYear;
  } else if (valid.reportType === "fahrer_card") {
    let driverRows;
    let weeklyRows;
    let monthlyRows;
    let fahrerReportYear = new Date().getUTCFullYear();
    const driverQuery = safeText(valid.driverQuery, "").trim();
    const likeQuery = driverQuery ? `%${driverQuery}%` : "";
    try {
      const masterResult = await queryNeon(
        dbConnectionString,
        FAHRER_CARD_MASTER_SQL,
        [driverQuery, likeQuery],
      );
      driverRows = masterResult.rows || [];
      if (!driverRows.length) {
        return json(
          {
            ok: false,
            error: "Driver not found",
            code: "DRIVER_NOT_FOUND",
          },
          404,
          { "Cache-Control": "no-store" },
        );
      }
      const driver = driverRows[0];
      fahrerReportYear = toIntSafe(driver?.report_year, fahrerReportYear);
      const [weeklyResult, monthlyResult] = await Promise.all([
        queryNeon(dbConnectionString, FAHRER_CARD_WEEKLY_SQL, [driver.fahrer_id]),
        queryNeon(dbConnectionString, FAHRER_CARD_MONTHLY_ACTIVITY_SQL, [driver.fahrer_id, driver.fahrername]),
      ]);
      weeklyRows = weeklyResult.rows || [];
      monthlyRows = monthlyResult.rows || [];
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

    const driver = driverRows[0];
    filename = makeFahrerCardFilename(driver?.fahrer_id || driverQuery);
    outputKey = `fahrer_card:${safeText(driver?.fahrer_id, driverQuery)}`;
    try {
      pdfBytes = await buildFahrerCardPdfWithPdfLib({
        userId: reportUserLabel,
        reportYear: fahrerReportYear,
        driver,
        weeklyRows,
        monthlyRows,
      });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const lines = [];
      lines.push("Fahrer-ID | Fahrername | Firma | Telefonnummer | LKW-Typ | Arbeitsplan | Urlaub gesamt | Krankheitstage");
      lines.push("-".repeat(160));
      lines.push([
        safeText(driver?.fahrer_id, ""),
        safeText(driver?.fahrername, ""),
        safeText(driver?.firma, ""),
        safeText(driver?.telefonnummer, ""),
        safeText(driver?.lkw_typ, ""),
        safeText(driver?.arbeitsplan, ""),
        safeText(driver?.urlaub_gesamt, "0"),
        safeText(driver?.krankheitstage, "0"),
      ].join(" | "));
      lines.push("");
      lines.push("Periode | Monat | LKW | Days | KM | CT | Bonus");
      lines.push("-".repeat(150));
      for (const row of monthlyRows.filter((item) => toIntSafe(item?.report_year, fahrerReportYear) === fahrerReportYear)) {
        lines.push([
          `${safeText(row?.report_year, "")}/${pad2(toIntSafe(row?.month_index, 0))}`,
          safeText(row?.month_name, ""),
          safeText(row?.lkw_list, "-"),
          formatTagCount(row?.days),
          formatMoneyInt(row?.bonus_km),
          formatMoneyInt(row?.ct),
          formatMoneyInt(row?.final),
        ].join(" | "));
      }
      pdfBytes = buildSimplePdf({
        title: `Fahrerkarte - ${safeText(driver?.fahrer_id, driverQuery)} ${safeText(driver?.fahrername, "")}`,
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: 1040,
        pageHeight: 595,
      });
    }
    valid.reportYear = fahrerReportYear;
    valid.driverId = safeText(driver?.fahrer_id, driverQuery);
    valid.driverName = safeText(driver?.fahrername, "");
  } else if (valid.reportType === "fahrer_type") {
    let rows;
    try {
      const result = await queryNeon(dbConnectionString, FAHRER_TYPE_LIST_SQL, [valid.lkwType]);
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

    filename = makeFahrerTypeFilename(valid.lkwType);
    outputKey = `fahrer_type:${valid.lkwType}`;
    try {
      pdfBytes = await buildFahrerListPdfWithPdfLib({
        title: `Fahrer - ${valid.lkwType}`,
        subtitle: `Active drivers from sheet Fahrer for ${valid.lkwType}`,
        rows,
        userId: reportUserLabel,
      });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const lines = [
        `Filter: ${valid.lkwType}`,
        `Total drivers: ${rows.length}`,
        "",
        "Fahrer-ID | Fahrername | Firma | Telefonnummer | Container / Planen",
        "-".repeat(150),
      ];
      for (const row of rows) {
        lines.push([
          safeText(row?.fahrer_id, ""),
          safeText(row?.fahrername, ""),
          safeText(row?.firma, ""),
          safeText(row?.telefonnummer, ""),
          safeText(row?.lkw_typ, ""),
        ].join(" | "));
      }
      pdfBytes = buildSimplePdf({
        title: `Fahrer - ${valid.lkwType}`,
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: 1040,
        pageHeight: 595,
      });
    }
  } else if (valid.reportType === "fahrer_firma") {
    let rows;
    try {
      const result = await queryNeon(dbConnectionString, FAHRER_FIRMA_LIST_SQL, [valid.firmaName]);
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

    filename = makeFahrerFirmaFilename(valid.firmaName);
    outputKey = `fahrer_firma:${valid.firmaName}`;
    try {
      pdfBytes = await buildFahrerListPdfWithPdfLib({
        title: `Fahrer - Firma`,
        subtitle: `Firma: ${valid.firmaName}`,
        rows,
        userId: reportUserLabel,
      });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const lines = [
        `Firma: ${valid.firmaName}`,
        `Total drivers: ${rows.length}`,
        "",
        "Fahrer-ID | Fahrername | Firma | Telefonnummer | Container / Planen",
        "-".repeat(150),
      ];
      for (const row of rows) {
        lines.push([
          safeText(row?.fahrer_id, ""),
          safeText(row?.fahrername, ""),
          safeText(row?.firma, ""),
          safeText(row?.telefonnummer, ""),
          safeText(row?.lkw_typ, ""),
        ].join(" | "));
      }
      pdfBytes = buildSimplePdf({
        title: `Fahrer - Firma`,
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: 1040,
        pageHeight: 595,
      });
    }
  } else if (valid.reportType === "bonus_firma_month") {
    let rows;
    try {
      const result = await queryNeon(
        dbConnectionString,
        BONUS_FIRMA_MONTHLY_SQL,
        [valid.year, valid.month, valid.firmaName],
      );
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

    filename = makeBonusFirmaMonthFilename(valid.year, valid.month, valid.firmaName);
    outputKey = `bonus_firma_month:${valid.year}:${pad2(valid.month)}:${valid.firmaName}`;
    try {
      pdfBytes = await buildBonusPdfWithPdfLib({
        userId: reportUserLabel,
        year: valid.year,
        month: valid.month,
        driverQuery: "",
        filterLabelOverride: `Firma: ${valid.firmaName}`,
        rows,
      });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const matrixRows = buildBonusMatrixRows(rows);
      const totalFinal = matrixRows.reduce((sum, row) => sum + toNumberSafe(row?.final, 0), 0);
      const lines = [];
      lines.push(`Firma: ${valid.firmaName}`);
      lines.push(`Monat: ${valid.year}/${pad2(valid.month)}`);
      lines.push(`Gesamtbonus: ${formatMoney(totalFinal)}`);
      lines.push("");
      lines.push("ID | Fahrer | Days | KM | %KM | CT | %CT | Bonus | Penalty | Final");
      lines.push("-".repeat(140));
      for (const row of matrixRows) {
        lines.push(
          [
            safeText(row.fahrer_id, ""),
            safeText(row.fahrer_name, ""),
            formatBonusCell(row.days, "int"),
            formatBonusCell(row.km, "money_int"),
            formatBonusCell(row.pct_km, "percent1"),
            formatBonusCell(row.ct, "int"),
            formatBonusCell(row.pct_ct, "percent1"),
            formatBonusCell(row.bonus, "money"),
            formatBonusCell(row.penalty, "money"),
            formatBonusCell(row.final, "money_int"),
          ].join(" | "),
        );
      }
      pdfBytes = buildSimplePdf({
        title: `Bonus - Firma ${valid.firmaName}`,
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: 1040,
        pageHeight: 595,
      });
    }
  } else {
    let rows;
    const driverQuery = safeText(valid.driverQuery, "").trim();
    const likeQuery = driverQuery ? `%${driverQuery}%` : "";
    try {
      const result = await queryNeon(
        dbConnectionString,
        valid.period === "year" ? BONUS_YEARLY_SQL : BONUS_MONTHLY_SQL,
        valid.period === "year"
          ? [valid.year, driverQuery, likeQuery]
          : [valid.year, valid.month, driverQuery, likeQuery],
      );
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

    filename = makeBonusFilename(valid.year, valid.month, new Date(), valid.period);
    outputKey = valid.period === "year"
      ? `bonus:${valid.year}:year:${driverQuery || "all"}`
      : `bonus:${valid.year}:${pad2(valid.month)}:${driverQuery || "all"}`;
    try {
      pdfBytes = valid.period === "year"
        ? await buildBonusYearPdfWithPdfLib({
          userId: reportUserLabel,
          year: valid.year,
          driverQuery,
          rows,
        })
        : await buildBonusPdfWithPdfLib({
          userId: reportUserLabel,
          year: valid.year,
          month: valid.month,
          driverQuery,
          rows,
        });
    } catch (err) {
      pdfEngine = "legacy-fallback";
      const lines = [];
      if (valid.period === "year") {
        const matrixRows = buildBonusYearMatrixRows(rows, valid.year);
        lines.push(`ID | Fahrer | ${BONUS_MONTHS_SHORT.map((m) => `${m} ${valid.year} Final`).join(" | ")} | ${valid.year} Total`);
        lines.push("-".repeat(240));
        for (const row of matrixRows) {
          lines.push(
            [
              safeText(row.fahrer_id, ""),
              safeText(row.fahrer_name, ""),
              ...Array.from({ length: 12 }, (_, idx) => formatBonusCell(row[`m${idx + 1}`], "money_int")),
              formatBonusCell(row.year_total, "money_int"),
            ].join(" | "),
          );
        }
      } else {
        const matrixRows = buildBonusMatrixRows(rows);
        lines.push("ID | Fahrer | Days | KM | %KM | CT | %CT | Bonus | Penalty | Final");
        lines.push("-".repeat(140));
        for (const row of matrixRows) {
          lines.push(
            [
              safeText(row.fahrer_id, ""),
              safeText(row.fahrer_name, ""),
              formatBonusCell(row.days, "int"),
              formatBonusCell(row.km, "money_int"),
              formatBonusCell(row.pct_km, "percent1"),
              formatBonusCell(row.ct, "int"),
              formatBonusCell(row.pct_ct, "percent1"),
              formatBonusCell(row.bonus, "money"),
              formatBonusCell(row.penalty, "money"),
              formatBonusCell(row.final, "money_int"),
            ].join(" | "),
          );
        }
      }
      pdfBytes = buildSimplePdf({
        title: valid.period === "year" ? `Bonus - ${valid.year} (whole year)` : `Bonus - ${valid.year}/${pad2(valid.month)}`,
        subtitle: formatReportGeneratedLabel(reportUserLabel),
        lines,
        pageWidth: valid.period === "year" ? 1040 : 842,
        pageHeight: 595,
      });
    }
  }

  const reportParams = { source: "miniapp_generate", report_type: valid.reportType };
  if ("year" in valid && "week" in valid) {
    reportParams.year = valid.year;
    reportParams.week = valid.week;
  }
  if (valid.reportType === "yf_driver_month") {
    reportParams.month = valid.month;
    reportParams.driver_query = safeText(valid.driverQuery, "").trim();
  }
  if (valid.reportType === "yf_lkw_month") {
    reportParams.year = valid.year;
    reportParams.month = valid.month;
    reportParams.lkw_id = safeText(valid.lkwId, "").trim();
  }
  if (valid.reportType === "bonus" && "year" in valid && "month" in valid) {
    reportParams.year = valid.year;
    if (valid.period === "month") reportParams.month = valid.month;
    reportParams.period = safeText(valid.period, "month");
    if (safeText(valid.driverQuery, "").trim()) {
      reportParams.driver_query = safeText(valid.driverQuery, "").trim();
    }
  }
  if (valid.reportType === "bonus_firma_month") {
    reportParams.year = valid.year;
    reportParams.month = valid.month;
    reportParams.firma_name = safeText(valid.firmaName, "");
  }
  if (valid.reportType === "fahrer_all" && "reportYear" in valid) {
    reportParams.report_year = valid.reportYear;
  }
  if (valid.reportType === "fahrer_card") {
    reportParams.driver_query = safeText(valid.driverQuery, "").trim();
    reportParams.driver_id = safeText(valid.driverId, "");
    reportParams.driver_name = safeText(valid.driverName, "");
    if ("reportYear" in valid) reportParams.report_year = valid.reportYear;
  }
  if (valid.reportType === "fahrer_type") {
    reportParams.lkw_type = safeText(valid.lkwType, "");
  }
  if (valid.reportType === "fahrer_firma") {
    reportParams.firma_name = safeText(valid.firmaName, "");
  }
  if ("lkwId" in valid) {
    reportParams.lkw_id = valid.lkwId;
  }
  try {
    await writeReportLog(dbConnectionString, {
      userId: auth.userId,
      chatId: auth.userId,
      reportType: valid.reportType,
      isoYear: "year" in valid ? valid.year : null,
      isoWeek: "week" in valid ? valid.week : null,
      status: "success",
      params: reportParams,
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
    month: url.searchParams.get("month"),
    period: url.searchParams.get("period") || "",
    lkw_id: url.searchParams.get("lkw_id") || "",
    driver_query: url.searchParams.get("driver_query") || "",
    firma_name: url.searchParams.get("firma_name") || "",
    lkw_type: url.searchParams.get("lkw_type") || "",
    disposition: url.searchParams.get("disposition") || "",
  };
  return handleGenerateWithBody(body, env, false);
}

async function handleEtlRun(request, env) {
  const body = await parseJsonBody(request);
  const auth = await validateTelegramInitData(body?.initData || "", env);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, 403, {
      "Cache-Control": "no-store",
    });
  }

  const dbConnectionString = getDbConnectionString(env);
  if (!dbConnectionString) {
    return json({ ok: false, error: "Database connection is not configured" }, 500, {
      "Cache-Control": "no-store",
    });
  }

  try {
    const allowed = await isUserAllowedInDb(auth.userId, env, dbConnectionString);
    if (!allowed) {
      return json({ ok: false, error: "Access denied" }, 403, {
        "Cache-Control": "no-store",
      });
    }
  } catch {
    return json({ ok: false, error: "Access check failed" }, 500, {
      "Cache-Control": "no-store",
    });
  }

  const triggerUrl = String(env.ETL_TRIGGER_URL || "").trim();
  if (!triggerUrl) {
    return json(
      { ok: false, error: "ETL trigger is not configured", code: "NOT_CONFIGURED" },
      501,
      { "Cache-Control": "no-store" },
    );
  }

  const headers = { "Content-Type": "application/json" };
  const triggerToken = String(env.ETL_TRIGGER_TOKEN || "").trim();
  if (triggerToken) headers.Authorization = `Bearer ${triggerToken}`;

  try {
    const resp = await fetch(triggerUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        initData: body?.initData || "",
        requested_by: auth.userId,
        source: "miniapp",
      }),
    });
    const text = await resp.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { ok: resp.ok, raw: text };
    }
    return json(
      {
        ok: !!payload?.ok && resp.ok,
        status: payload?.status || (resp.ok ? "started" : "failed"),
        error: payload?.error || null,
        source: "etl-trigger-proxy",
      },
      resp.ok ? 200 : resp.status || 500,
      { "Cache-Control": "no-store" },
    );
  } catch (err) {
    return json(
      {
        ok: false,
        error: String(err?.message || err || "ETL trigger failed"),
      },
      502,
      { "Cache-Control": "no-store" },
    );
  }
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

      try {
        const trucksResult = await queryNeon(
          dbConnectionString,
          `
            SELECT
              external_id AS lkw_id,
              COALESCE(NULLIF(plate_number, ''), NULLIF(raw_payload->>'LKW-Nummer', ''), NULLIF(raw_payload->>'Number', '')) AS lkw_nummer
            FROM trucks
            ORDER BY external_id
          `,
          [],
        );
        meta.lookups = meta.lookups || {};
        meta.lookups.lkw_vehicles = (trucksResult.rows || []).map((row) => ({
          lkw_id: safeText(row.lkw_id, ""),
          lkw_nummer: safeText(row.lkw_nummer, ""),
          label: [safeText(row.lkw_id, ""), safeText(row.lkw_nummer, "")].filter(Boolean).join(" - "),
        })).filter((row) => row.lkw_id);
      } catch {
        // Optional lookup only.
      }
      try {
        const driversResult = await queryNeon(
          dbConnectionString,
          `
            SELECT
              external_id AS fahrer_id,
              full_name AS fahrername
            FROM drivers
            WHERE COALESCE(external_id, '') <> ''
              AND COALESCE(full_name, '') <> ''
            ORDER BY external_id
          `,
          [],
        );
        meta.lookups = meta.lookups || {};
        meta.lookups.fahrer_drivers = (driversResult.rows || []).map((row) => ({
          fahrer_id: safeText(row.fahrer_id, ""),
          fahrername: safeText(row.fahrername, ""),
          label: [safeText(row.fahrer_id, ""), safeText(row.fahrername, "")].filter(Boolean).join(" - "),
        })).filter((row) => row.fahrer_id);
      } catch {
        // Optional lookup only.
      }
      try {
        const firmenResult = await queryNeon(
          dbConnectionString,
          `
            SELECT DISTINCT
              COALESCE(NULLIF(c.name, ''), NULLIF(d.raw_payload->>'Firma', ''), NULLIF(d.raw_payload->>'Company', '')) AS firma
            FROM drivers d
            LEFT JOIN companies c ON c.id = d.company_id
            WHERE COALESCE(d.is_active, true)
              AND COALESCE(NULLIF(c.name, ''), NULLIF(d.raw_payload->>'Firma', ''), NULLIF(d.raw_payload->>'Company', ''), '') <> ''
            ORDER BY firma
          `,
          [],
        );
        meta.lookups = meta.lookups || {};
        meta.lookups.fahrer_firms = (firmenResult.rows || [])
          .map((row) => safeText(row.firma, ""))
          .filter(Boolean);
      } catch {
        // Optional lookup only.
      }
      try {
        const yfDriversResult = await queryNeon(
          dbConnectionString,
          `
            SELECT DISTINCT fahrer_name
            FROM report_yf_fahrer_monthly
            WHERE COALESCE(fahrer_name, '') <> ''
            ORDER BY fahrer_name
          `,
          [],
        );
        meta.lookups = meta.lookups || {};
        meta.lookups.yf_drivers = (yfDriversResult.rows || [])
          .map((row) => safeText(row.fahrer_name, ""))
          .filter(Boolean);
      } catch {
        // Optional lookup only.
      }
      try {
        const yfLkwResult = await queryNeon(
          dbConnectionString,
          `
            SELECT DISTINCT lkw_nummer
            FROM report_yf_lkw_daily
            WHERE COALESCE(lkw_nummer, '') <> ''
            ORDER BY lkw_nummer
          `,
          [],
        );
        meta.lookups = meta.lookups || {};
        meta.lookups.yf_lkw_numbers = (yfLkwResult.rows || [])
          .map((row) => safeText(row.lkw_nummer, ""))
          .filter(Boolean);
      } catch {
        // Optional lookup only.
      }
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

    if (request.method === "POST" && url.pathname === "/api/etl/run") {
      return handleEtlRun(request, env);
    }
    
    if (request.method === "GET" && url.pathname === "/api/generate") {
      return handleGenerateGet(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/history") {
      return handleHistory(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/history/delete") {
      return handleHistoryDelete(request, env);
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
