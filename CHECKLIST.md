# LKW Report Bot — Checklist

> Last updated: 2026-02-17
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

- [x] **0.1** Cloudflare Pages project
  - Create new Cloudflare Pages project (separate domain, NOT groo.de)
  - Deploy Mini App static files
  - Deployed project: `groo-lkw-miniapp`
  - Result: Mini App live at `https://groo-lkw-miniapp.pages.dev`

- [x] **0.1.1** Migrate Pages to Git auto-deploy
  - New Git-connected Pages project created: `groo-lkw-miniapp-git`
  - Build settings: `Framework=None`, `Build output directory=miniapp`
  - Production secrets migrated: `TELEGRAM_BOT_TOKEN`, `WHITELIST_USER_IDS`
  - Hyperdrive binding migrated: `HYPERDRIVE -> neon-prod`
  - Result: automatic deploy on every push to `main`

- [x] **0.2** Neon PostgreSQL database
  - Create Neon account + project (free tier)
  - Neon project created: `dry-dew-84175016` (branch `production`)
  - Result: empty database ready for data

- [x] **0.3** Custom domain `groo-webapp.app`
  - Buy `groo-webapp.app` domain (~$12-14/year)
  - Purchased in Cloudflare Registrar (2026-02-16)
  - Connect to Cloudflare Pages project
  - Moved from direct-upload project `groo-lkw-miniapp` to Git project `groo-lkw-miniapp-git`
  - Current status on `groo-lkw-miniapp-git`: `Active` (SSL enabled)
  - Result: Mini App at `https://groo-webapp.app`

- [x] **0.3.1** Replace emoji icons with SVG duotone set
  - Replace 6 tile emojis (📦🚛👨‍✈️📊💰🎯) + UI icons (🔐✓✕) with custom SVG
  - Palette: Base #3BB3FF→#1B2B8F, Accent #35F0A0→#7B4DFF, Lines #0D1B5A
  - Style: duotone, single light source, readable at small sizes, techno/volumetric
  - Code updated in `miniapp/index.html`: removed `✓/✕`, switched to SVG icons, fixed icon paths for Pages (`icons/...`)
  - Verified on live `https://groo-lkw-miniapp.pages.dev`: HTML uses `icons/...` (no `static/icons/...`)
  - Visual check passed in browser with cache-buster (`?v=20260216-2`): SVG icons visible
  - Result: unified icon set matching app design

- [x] **0.3.2** UI contrast + navigation polish
  - Removed violet glow near right arrows in report tiles
  - Reworked tile arrows to minimal right-pointing triangles (no box)
  - Arrow color aligned with icon-tile tone for consistent visual language
  - Lightened icon containers for stronger icon contrast
  - Added bottom button "Open full screen"
  - Added avatar proxy endpoint (`GET /api/avatar`) in `miniapp/_worker.js` to improve Telegram avatar loading without exposing bot token
  - Deployed via Git auto-deploy (`main`, commits `b275bb8`, `a910d5f`)
  - Result: cleaner cards, better readability, fullscreen action, improved avatar fallback path

- [-] **0.4** UPS for PC (deferred)
  - Buy UPS (APC Back-UPS 700VA, ~60 EUR)
  - Deferred by owner (2026-02-16); revisit before production hardening
  - Result: PC survives short power outages (ETL + bot keep running)

- [x] **0.5** Bot autostart on PC boot
  - Task Scheduler → run bot at logon
  - Existing task found: `\LKW Report Bot` (`At system start up`, task command `run_silent.vbs`)
  - Verified on host (2026-02-16): `Logon Mode: Interactive/Background`, `Last Result: 0`
  - Result: bot starts automatically after reboot

---

## Phase 1 — ETL Pipeline (Excel → PostgreSQL)

- [x] **1.1** Analyze Excel data structure
  - Map sheets, columns, named ranges in both files
  - Document LKW IDs, Fahrer IDs, data relationships
  - Documented in repo: `docs/excel_data_map.md`
  - Result: clear understanding of what data to extract

- [x] **1.2** Create database schema
  - SQL migration: tables for trucks, drivers, schedules, work hours
  - Indexes for report queries (by week, by company, etc.)
  - Drafted migration in repo: `sql/001_init_schema.sql`
  - Applied in Neon SQL Editor on `production` branch (2026-02-16)
  - Result: PostgreSQL schema matching Excel data model

- [x] **1.2.1** Apply schema migration in Neon
  - Open Neon SQL Editor on `production` branch
  - Execute `sql/001_init_schema.sql`
  - Verify created tables + indexes
  - Result: schema physically created in cloud database

- [x] **1.3** ETL script: read .xlsm (openpyxl)
  - Python script reads `LKW_Fahrer_Data.xlsm`
  - Extracts data → transforms → inserts into PostgreSQL
  - Implemented MVP script: `etl_xlsm_to_postgres.py` (companies + trucks + drivers + etl_log)
  - First real import executed successfully (2026-02-16)
  - Result: .xlsm data in Postgres

- [x] **1.3.1** First ETL run against Neon
  - Set `DATABASE_URL` in `.env`
  - Run: `python etl_xlsm_to_postgres.py`
  - Verify rows in `companies`, `trucks`, `drivers`, `etl_log`
  - Verified in DB: companies=7, trucks=77, drivers=82, etl_log status=success
  - Result: first real data import from `.xlsm` confirmed

- [x] **1.4** ETL script: read .xlsb (pyxlsb)
  - Python script reads `LKW_Fahrer_Plan.xlsb`
  - Extracts data → transforms → inserts into PostgreSQL
  - Implemented and executed: `etl_xlsb_to_postgres.py`
  - First import result: `records=1232`, `inserted=1232`
  - Result: .xlsb data in Postgres

- [x] **1.4.1** First XLSB ETL run against Neon
  - Run: `python etl_xlsb_to_postgres.py`
  - Verify rows in `schedules` + `etl_log`
  - Verified: `schedules=1232`, latest `etl_log.source_name='xlsb_fahrer_plan'`, `status='success'`
  - Result: schedule data from `.xlsb` available in Postgres

- [x] **1.4.2** Improve truck/driver matching quality for XLSB ETL
  - Added stronger normalization and mixed-cell parsing in `etl_xlsb_to_postgres.py`
  - Handles values like `Name U`, `Name↔ / Werkstatt`, `Name / O.F.` and similar
  - Verified after rerun (2026-02-16):
    - `with_driver` improved from `840` to `954`
    - `driver_id NULL` total now `278`, of which only `1` is assignment (remaining are status rows)
    - `truck_id NULL` remains `30` for special pseudo-truck row `LKW Ohne Fahrer`
  - Result: relational quality is now sufficient for SQL-first reports

- [x] **1.4.3** Add managed aliases for unresolved names/trucks (data governance)
  - Implemented service marker handling in ETL (`andreas groo` -> status token)
  - Verified after rerun: `driver_null_assignment = 0`; `Andreas Groo` rows are `assignment_type='status'`
  - Remaining `truck_id NULL` = pseudo-truck `LKW Ohne Fahrer` (intentional)
  - Result: deterministic matching and zero unresolved assignment-driver links

- [x] **1.5** ETL scheduling (Task Scheduler)
  - Windows Task Scheduler runs ETL ~3x/day
  - Incremental updates (only changed rows)
  - Logging + error notification to admin via Telegram
  - Added pipeline runner: `run_etl_pipeline.py`
  - Added scheduler installer: `install_etl_schedule.cmd`
  - Task created: `LKW_Report_Bot_ETL_3xDaily` (every 8 hours starting 06:30)
  - Result: Postgres always has fresh data (max 8h lag)

- [x] **1.5.1** Enable ETL scheduled task on host
  - Run `install_etl_schedule.cmd`
  - Verify task `LKW_Report_Bot_ETL_3xDaily` exists and next run time is set
  - Verify one-shot run writes `etl_runner.log` and `etl_log` success entries
  - Verified on host (2026-02-16): task exists, next run is set, one-shot run succeeded
  - Result: automatic ETL every 8 hours active

- [x] **1.5.2** Switch ETL task to non-interactive run mode
  - Configure task to run even when user is logged off (not `Interactive only`)
  - Use dedicated service account credentials in Task Scheduler
  - Verified mode: `Interactive/Background`, manual run `Last Result=0` (2026-02-16)
  - Result: ETL continues after reboot/logout, true background 24/7 operation

- [x] **1.6** ETL monitoring
  - Store import timestamps in Postgres (table: etl_log)
  - /api/meta returns last_import_at timestamp
  - Alert admin if import older than 12 hours
  - Implemented in API: `/api/meta` now includes `etl.last_import_at`, `etl.age_sec`, `etl.is_stale`
  - Freshness monitor task created: `LKW_Report_Bot_ETL_Freshness` (every 30 minutes)
  - Result: visibility into data freshness

- [x] **1.6.1** Expose ETL freshness in API
  - `web_server.py` reads latest successful import from `etl_log`
  - `/api/meta` includes stale threshold (`ETL_STALE_AFTER_HOURS`, default 12h)
  - Result: frontend/monitoring can detect stale ETL data

- [x] **1.6.2** Alert admin when ETL is stale (>12h)
  - Add scheduled freshness-check job (reads `etl_log`, sends Telegram alert once per stale window)
  - Implemented script: `check_etl_freshness.py` with anti-spam state file
  - Installed task: `install_etl_freshness_monitor.cmd`
  - Verified monitor run result `0` and stale logic test run
  - Result: silent ETL failures are surfaced automatically

- [x] **1.6.3** Switch freshness monitor task to non-interactive run mode
  - Configured `LKW_Report_Bot_ETL_Freshness` to run whether user is logged on or not
  - Verified via `schtasks /Query /TN "LKW_Report_Bot_ETL_Freshness" /FO LIST /V`:
    `Logon Mode: Interactive/Background`, `Last Result: 0`
  - Result: stale alerting continues after reboot/logout

---

## Phase 2 — API (Cloudflare Pages Functions)

- [x] **2.1** Connect Functions to Neon PostgreSQL
  - Configure Hyperdrive connection pool
  - Hyperdrive config created in Cloudflare: `neon-prod` (2026-02-16)
  - Pages binding added on project `groo-lkw-miniapp` (Production): `HYPERDRIVE -> neon-prod`
  - Environment variables: DATABASE_URL in Cloudflare dashboard
  - Result: Functions can query Postgres

- [x] **2.2** GET /api/reports
  - Return list of available report types with params
  - Served from config (similar to current report_config.py)
  - Implemented in Pages worker file: `miniapp/_worker.js` (`GET /api/reports`)
  - Verified on live: `https://groo-lkw-miniapp.pages.dev/api/reports` returns JSON (HTTP 200)
  - Result: Mini App knows what reports are available

- [x] **2.3** GET /api/meta
  - Return: last ETL import time, schedule info, timezone
  - Implemented endpoint in `miniapp/_worker.js` (`GET /api/meta`) with schedule + ETL freshness payload shape
  - Verified on live: `https://groo-lkw-miniapp.pages.dev/api/meta` returns JSON (HTTP 200)
  - Result: Mini App shows data freshness

- [~] **2.4** POST /api/generate
  - Validate Telegram initData (HMAC-SHA256)
  - Run SQL query based on report_type + params
  - Generate PDF (pdf-lib or Browser Rendering API)
  - Return PDF file or download URL
  - Implemented endpoint in `miniapp/_worker.js` with payload validation (`report_type`, `year/week`)
  - Current behavior: returns controlled JSON with `501 NOT_IMPLEMENTED` (instead of 404)
  - Security path now enforced by step 2.5 (valid Telegram `initData` required)
  - Pending: real SQL execution + PDF generation + delivery contract
  - Result: reports generated in seconds from SQL, no Excel

- [x] **2.5** Telegram initData validation in Worker
  - Port HMAC validation logic from Python to JavaScript
  - Whitelist check against Postgres table
  - Implemented in `miniapp/_worker.js`: Telegram `initData` HMAC-SHA256 verification + `auth_date` age check
  - Added whitelist enforcement via env `WHITELIST_USER_IDS` (temporary)
  - Worker secrets configured in Cloudflare Production: `TELEGRAM_BOT_TOKEN`, `WHITELIST_USER_IDS`
  - Live verification: invalid/pseudo `initData` is rejected (`403 initData hash is missing`)
  - Pending improvement: move whitelist source from env to Postgres table (`allowed_users`)
  - Result: same security as current bot

- [x] **2.6** Rate limiting
  - Per-user cooldown (5 sec) stored in KV or in-memory
  - Implemented in `miniapp/_worker.js`: in-memory per-user cooldown with `429 RATE_LIMITED`
  - Supports env override: `API_COOLDOWN_SEC` (default 5)
  - Verified on live endpoint:
    - 1st valid request -> `501 NOT_IMPLEMENTED`
    - 2nd immediate request -> `429 RATE_LIMITED`, `retry_after_sec=5`
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
