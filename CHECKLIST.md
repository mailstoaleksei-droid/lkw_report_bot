# LKW Report Bot — Checklist

> Last updated: 2026-02-13
> Status legend: [ ] pending | [~] in progress | [x] done | [-] skipped

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CLOUDFLARE (cloud)                                         │
│                                                             │
│  ┌──────────────────┐    ┌─────────────────────────────┐   │
│  │ Cloudflare Pages │    │ Pages Functions (Workers)    │   │
│  │ Mini App (HTML)  │───>│ GET  /api/reports            │   │
│  │ Static assets    │    │ GET  /api/meta               │   │
│  └──────────────────┘    │ POST /api/generate           │   │
│                          │ GET  /api/job/:id            │   │
│                          └──────────┬──────────────────┘   │
│                                     │ SQL queries           │
│                          ┌──────────▼──────────────────┐   │
│                          │ Neon PostgreSQL (free tier)  │   │
│                          │ 0.5 GB / 100 CU-hours/month │   │
│                          │ via Hyperdrive (pool)        │   │
│                          └──────────▲──────────────────┘   │
└─────────────────────────────────────┼───────────────────────┘
                                      │ INSERT/UPDATE
┌─────────────────────────────────────┼───────────────────────┐
│  WINDOWS PC (office)                │                        │
│                                     │                        │
│  ┌──────────────────┐    ┌─────────┴───────────────────┐   │
│  │ Telegram Bot     │    │ ETL Script (Task Scheduler) │   │
│  │ (polling only)   │    │ openpyxl → .xlsm            │   │
│  │ calls CF API     │    │ pyxlsb  → .xlsb             │   │
│  │ sends PDF to user│    │ runs ~3x/day                │   │
│  └──────────────────┘    └─────────────────────────────┘   │
│                                                             │
│  Excel files (SharePoint-synced):                           │
│  • LKW_Fahrer_Data.xlsm                                    │
│  • LKW_Fahrer_Plan.xlsb                                    │
└─────────────────────────────────────────────────────────────┘
```

**Key principle:** Excel is NEVER opened during report generation.
Reports are generated from PostgreSQL data in milliseconds via SQL.

---

## Phase 0 — Infrastructure

- [ ] **0.1** Cloudflare Pages project
  - Create new Cloudflare Pages project (separate domain, NOT groo.de)
  - Deploy Mini App static files
  - Result: Mini App live at `https://<project>.pages.dev`

- [ ] **0.2** Neon PostgreSQL database
  - Create Neon account + project (free tier)
  - Design database schema (tables: lkw, fahrer, schedules, reports_log)
  - Result: empty database ready for data

- [ ] **0.3** Custom domain `groo-webapp.app`
  - Buy `groo-webapp.app` domain (~$12-14/year)
  - Connect to Cloudflare Pages project
  - Result: Mini App at `https://groo-webapp.app`

- [ ] **0.3.1** Replace emoji icons with SVG duotone set
  - Replace 6 tile emojis (📦🚛👨‍✈️📊💰🎯) + UI icons (🔐✓✕) with custom SVG
  - Palette: Base #3BB3FF→#1B2B8F, Accent #35F0A0→#7B4DFF, Lines #0D1B5A
  - Style: duotone, single light source, readable at small sizes, techno/volumetric
  - Result: unified icon set matching app design

- [ ] **0.4** UPS for PC
  - Buy UPS (APC Back-UPS 700VA, ~60 EUR)
  - Result: PC survives short power outages (ETL + bot keep running)

- [ ] **0.5** Bot autostart on PC boot
  - Task Scheduler → run bot at logon
  - Result: bot starts automatically after reboot

---

## Phase 1 — ETL Pipeline (Excel → PostgreSQL)

- [ ] **1.1** Analyze Excel data structure
  - Map sheets, columns, named ranges in both files
  - Document LKW IDs, Fahrer IDs, data relationships
  - Result: clear understanding of what data to extract

- [ ] **1.2** Create database schema
  - SQL migration: tables for trucks, drivers, schedules, work hours
  - Indexes for report queries (by week, by company, etc.)
  - Result: PostgreSQL schema matching Excel data model

- [ ] **1.3** ETL script: read .xlsm (openpyxl)
  - Python script reads `LKW_Fahrer_Data.xlsm`
  - Extracts data → transforms → inserts into PostgreSQL
  - Result: .xlsm data in Postgres

- [ ] **1.4** ETL script: read .xlsb (pyxlsb)
  - Python script reads `LKW_Fahrer_Plan.xlsb`
  - Extracts data → transforms → inserts into PostgreSQL
  - Result: .xlsb data in Postgres

- [ ] **1.5** ETL scheduling (Task Scheduler)
  - Windows Task Scheduler runs ETL ~3x/day
  - Incremental updates (only changed rows)
  - Logging + error notification to admin via Telegram
  - Result: Postgres always has fresh data (max 8h lag)

- [ ] **1.6** ETL monitoring
  - Store import timestamps in Postgres (table: etl_log)
  - /api/meta returns last_import_at timestamp
  - Alert admin if import older than 12 hours
  - Result: visibility into data freshness

---

## Phase 2 — API (Cloudflare Pages Functions)

- [ ] **2.1** Connect Functions to Neon PostgreSQL
  - Configure Hyperdrive connection pool
  - Environment variables: DATABASE_URL in Cloudflare dashboard
  - Result: Functions can query Postgres

- [ ] **2.2** GET /api/reports
  - Return list of available report types with params
  - Served from config (similar to current report_config.py)
  - Result: Mini App knows what reports are available

- [ ] **2.3** GET /api/meta
  - Return: last ETL import time, schedule info, timezone
  - Result: Mini App shows data freshness

- [ ] **2.4** POST /api/generate
  - Validate Telegram initData (HMAC-SHA256)
  - Run SQL query based on report_type + params
  - Generate PDF (pdf-lib or Browser Rendering API)
  - Return PDF file or download URL
  - Result: reports generated in seconds from SQL, no Excel

- [ ] **2.5** Telegram initData validation in Worker
  - Port HMAC validation logic from Python to JavaScript
  - Whitelist check against Postgres table
  - Result: same security as current bot

- [ ] **2.6** Rate limiting
  - Per-user cooldown (5 sec) stored in KV or in-memory
  - Result: protection from spam

---

## Phase 3 — PDF Generation

- [ ] **3.1** Prototype with pdf-lib (JavaScript)
  - Build one report (Bericht) as PDF using pdf-lib in Worker
  - Test: tables, headers, formatting, German characters
  - Result: evaluate if quality is sufficient

- [ ] **3.2** Fallback: Cloudflare Browser Rendering API
  - If pdf-lib insufficient → HTML template + Browser Rendering
  - Jinja2-style template → HTML → PDF
  - Cost: $0.09/browser-hour (~6 sec/PDF)
  - Result: production-quality PDF from SQL data

- [ ] **3.3** PDF caching (Cloudflare R2 or KV)
  - Cache generated PDFs by key `{type}_{year}_{week}`
  - TTL: 1 hour (data changes ~3x/day)
  - Result: repeated requests instant, no regeneration

---

## Phase 4 — Telegram Bot Simplification

- [ ] **4.1** Remove web_server.py from bot
  - Bot no longer hosts Mini App (Cloudflare Pages does)
  - Bot no longer runs aiohttp server
  - Result: bot is lightweight — polling + sending files only

- [ ] **4.2** Bot calls Cloudflare API
  - /report command → call POST /api/generate on Cloudflare
  - Receive PDF → send to user via Telegram
  - Result: same UX, but report from Postgres (not Excel)

- [ ] **4.3** Update WEBAPP_URL
  - `.env`: `WEBAPP_URL=https://<project>.pages.dev`
  - BotFather → Mini App URL → new Cloudflare Pages URL
  - Result: Mini App opens from Cloudflare, not local server

- [ ] **4.4** Remove Excel COM dependencies
  - Remove: excel_service.py, excel_runner.py, pywin32 from requirements
  - Remove: EXCEL_LOCK, _run_report_fn, refresh_tunnel.py
  - Result: bot has zero Excel/COM/VBA dependency

- [ ] **4.5** Keep watchdog + heartbeat
  - Watchdog monitors bot process (simpler — no HTTP health check needed)
  - Heartbeat file still written
  - Result: bot auto-restarts if crashed

---

## Phase 5 — Mini App Updates

- [ ] **5.1** Update API endpoints in Mini App
  - Point fetch() calls to Cloudflare Functions (not localhost)
  - Result: Mini App works from Cloudflare Pages

- [ ] **5.2** Enhanced greeting (already implemented)
  - Photo from Telegram, name, ID — already working
  - Add: time-of-day greeting, last report info from Postgres
  - Result: personalized experience

- [ ] **5.3** Report history
  - Store generation log in Postgres (table: reports_log)
  - Show last 10 reports in Mini App with re-generate button
  - Result: user sees history, can repeat with one tap

- [ ] **5.4** Light theme support
  - Support Telegram light/dark theme via CSS variables
  - Result: correct appearance for all users

---

## Phase 6 — New Reports (5-10 types)

- [ ] **6.1** Map all report types to SQL queries
  - For each report: define SQL that produces the same data as VBA macro
  - Result: every report has a SQL equivalent

- [ ] **6.2** Report registry (config)
  - JSON/JS config: report types, params, SQL templates, PDF layout
  - Result: adding new report = config entry + SQL query + PDF template

- [ ] **6.3** Implement reports one by one
  - Bericht (trucks by company) — first, validate against Excel output
  - Tankkarten, Fahrerzeiten, Urlaubsplan, etc.
  - Result: each report generates from Postgres, matches Excel output

- [ ] **6.4** Scheduled reports
  - Cloudflare Cron Triggers (or bot's APScheduler)
  - Auto-generate and send reports on schedule
  - Result: same scheduled delivery as current system

---

## Phase 7 — Monitoring & Production

- [ ] **7.1** Uptime monitoring
  - Monitor Cloudflare Pages /healthz endpoint
  - Monitor bot heartbeat on Windows
  - Result: alerts on downtime

- [ ] **7.2** ETL data validation
  - Compare row counts: Excel vs Postgres after each import
  - Alert if mismatch > threshold
  - Result: data integrity guaranteed

- [ ] **7.3** Excel backup
  - Daily copy of both Excel files to separate location
  - Result: data loss protection

- [ ] **7.4** Gradual rollout
  - Run old (Excel COM) and new (Postgres) in parallel
  - Compare outputs for same report
  - Switch users to new system one by one
  - Result: zero-downtime migration

---

## Known Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| PDF quality (pdf-lib) insufficient | MEDIUM | HIGH | Fallback to Browser Rendering API ($0.09/hr) |
| Neon free tier storage (0.5 GB) | LOW | MEDIUM | Store only data, not files. Upgrade if needed ($19/mo) |
| ETL fails silently | MEDIUM | HIGH | Task 1.6 (monitoring + admin alerts) |
| Excel file format changes | LOW | MEDIUM | ETL validation + alerts (Task 7.2) |
| PC offline = no ETL | MEDIUM | HIGH | Tasks 0.4 + 0.5 (UPS + autostart). Data in Postgres still serves reports |
| SQL reports don't match Excel | MEDIUM | HIGH | Task 7.4 (parallel run, compare outputs) |
| SharePoint sync locks Excel | MEDIUM | MEDIUM | ETL reads copy (not original), retry on lock |

---

## Cost Estimate

| Service | Plan | Cost |
|---------|------|------|
| Cloudflare Pages | Free | $0 |
| Cloudflare Workers/Functions | Free (100k req/day) | $0 |
| Neon PostgreSQL | Free (0.5 GB) | $0 |
| Cloudflare Hyperdrive | Free with Workers | $0 |
| Domain (optional) | .dev or .com | ~$5-12/year |
| Browser Rendering (if needed) | Pay-as-you-go | ~$1-5/month |
| **Total** | | **$0 - $17/year** (without Browser Rendering) |

---

## Execution Order (recommended)

```
Phase 0 (infra)     ████░░░░░░  ← START HERE
Phase 1 (ETL)       ░░████░░░░  ← data foundation
Phase 2 (API)       ░░░░████░░  ← backend
Phase 3 (PDF)       ░░░░░████░  ← output
Phase 4 (bot)       ░░░░░░██░░  ← simplify bot
Phase 5 (Mini App)  ░░░░░░░██░  ← frontend
Phase 6 (reports)   ░░░░░░░░██  ← scale
Phase 7 (prod)      ░░░░░░░░░█  ← monitoring
```
