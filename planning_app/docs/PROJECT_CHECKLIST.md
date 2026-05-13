# LKW Planning App Project Checklist

Status legend:
- `[x]` done
- `[~]` in progress
- `[ ]` pending
- `[manual]` manual action needed

## 0. Safety And Separation

- [x] Existing Telegram Mini App inspected.
- [x] Existing Telegram bot/reporting workflow inspected.
- [x] Existing PostgreSQL reporting schema inspected.
- [x] Existing Excel files and key sheets inspected.
- [x] New app created in isolated folder `planning_app/`.
- [x] Existing `miniapp/`, `bot.py`, and ETL scripts left untouched for planning work.
- [x] No real secrets added to `planning_app/`.
- [x] `.env.example` added with placeholders only.
- [x] Decide production DB boundary: separate DB `lkw_planning`.

## 1. Foundation

- [x] Monorepo skeleton added.
- [x] API workspace added.
- [x] Web workspace added.
- [x] Docker Compose skeleton added.
- [x] Prisma schema draft added.
- [x] README added.
- [x] Technical audit added.
- [x] Architecture document added.
- [x] Roadmap added.
- [x] Project checklist added.
- [x] Manual actions document added.
- [x] Install Node dependencies.
- [x] Validate Prisma schema with real Prisma CLI.
- [x] Create first Prisma migration.
  - Migration SQL is stored in `prisma/migrations/202605121_initial_planning_schema/migration.sql`.
  - It was applied manually to `lkw_planning` because Prisma schema engine failed against Neon TLS on this Windows machine.
- [x] Add seed script for first Admin user.
- [x] Seed first Admin user: `a.samosvat@groo.de`.
- [x] Add local `.env` for development.
- [x] Configure Prisma runtime with JS PostgreSQL adapter.
- [x] Verify Docker Compose build.
  - Docker Desktop 4.73.0 installed successfully on 2026-05-13.
  - WSL 2.7.3 installed after Docker Desktop setup.
  - `docker compose build` passed.
  - `docker compose up -d --build --force-recreate` passed.
  - Postgres and API healthchecks passed; web responded on `http://localhost:3000`.

## 2. Backend API

- [x] Fastify health endpoint skeleton added.
- [x] Add environment/config module.
- [x] Add Prisma client module.
- [x] Add auth module.
- [x] Add password hashing.
- [x] Add session/JWT flow.
- [x] Add role guards.
  - `requireUser` verifies session cookie and minimum role.
- [ ] Add user management endpoints.
- [x] Add LKW endpoints.
  - `GET /api/lkw` supports read filters for the planning UI.
- [x] Add driver endpoints.
  - `GET /api/drivers` supports read filters for the planning UI.
- [x] Add order endpoints.
  - `POST /api/orders`, `PATCH /api/orders/:id`, and `POST /api/orders/:id/cancel`.
- [x] Add assignment endpoints.
  - `POST /api/assignments/upsert` creates or updates one active assignment per order.
- [x] Add planning query endpoints.
  - `GET /api/planning/day?date=YYYY-MM-DD` returns counters, LKW-first rows, driver availability, and unassigned orders.
- [x] Add audit log endpoints.
  - `GET /api/audit-log` supports entity, order, assignment, user, event type, and limit filters.
- [~] Add import endpoints.
- [x] Add export endpoints.
  - `GET /api/exports/tagesplanung.csv?date=YYYY-MM-DD` exports Tagesplanung rows for Excel.
- [ ] Add holiday endpoints.

## 3. Database Model

- [x] Users and roles drafted.
- [x] LKW master data drafted.
- [x] Driver master data drafted.
- [x] Daily driver availability drafted.
- [x] Orders drafted.
- [x] Assignments drafted.
- [x] Nullable chassis support drafted.
- [x] Holidays drafted.
- [x] Audit log drafted.
- [x] Imports and import errors drafted.
- [x] Export logs drafted.
- [x] Future Telegram account table drafted.
- [x] Future external order mapping table drafted.
- [x] Add LKW alias table for `Wagen` mapping.
- [x] Add daily plan import staging table.
- [x] Add explicit normalized status mapping table or code module.
- [x] Add migration indexes review.
  - Initial indexes exist for planning date, LKW, driver, Runde, status, createdAt, and updatedAt.

## 4. Excel And Existing DB Imports

- [x] Import from existing reporting DB: companies, LKW, drivers.
  - Preview endpoint added: `GET /api/imports/reporting-master-data/preview`.
  - Execute endpoint added: `POST /api/imports/reporting-master-data/execute`.
  - Imported on 2026-05-13: 14 companies, 78 LKW, 157 LKW aliases, 92 drivers.
  - Skipped 7 placeholder LKW rows without `plate_number`.
  - Docker API preview and execute endpoints verified on 2026-05-13.
- [x] Import from existing reporting DB: weekly schedules.
  - Preview endpoint added: `GET /api/imports/reporting-schedules/preview`.
  - Execute endpoint added: `POST /api/imports/reporting-schedules/execute`.
  - Imported on 2026-05-13: 1587 weekly schedule orders and 1587 assignments.
  - Skipped 548 reporting status rows that are not assignment rows.
  - Marked 12 imported schedule orders as `PROBLEM` because no driver was resolved in the reporting source.
  - Docker API preview and execute endpoints verified on 2026-05-13.
- [x] Import from reporting DB `report_fahrer_weekly_status`: daily vacation/sick data.
  - Preview endpoint added: `GET /api/imports/reporting-driver-availability/preview`.
  - Execute endpoint added: `POST /api/imports/reporting-driver-availability/execute`.
  - Imported on 2026-05-13: 5712 daily availability rows from 816 U/K weekly source rows.
  - Marked 15 assignments and 15 linked orders as `PROBLEM` where the assigned driver is unavailable.
  - Docker API preview and execute endpoints verified on 2026-05-13.
- [ ] Direct Excel `Urlaub` import fallback, if reporting DB ETL is unavailable.
- [ ] Import from Excel daily Tagesplan source.
- [x] Identify exact source sheet for daily Tagesplan.
  - Source workbook: `Dispo 2026 Wochenplanung_.xlsm`.
  - Each date sheet is one planning date, for example `04.05`.
  - Header row is row 1.
- [ ] Parse `Runde_1`, `Runde_2`, `Runde_3`.
- [~] Map `Wagen` values to LKW.
  - Confirmed examples: `2206 -> GR-OO2206`, `411 -> KO-HH411`, `4295 -> WI-QY4295`.
- [x] Add preview before import.
- [x] Add validation report.
- [x] Add duplicate detection.
  - Current master import uses upsert by company name, LKW number, driver external ID, and alias/source.
- [x] Add safe transaction execution.
  - Master import uses a Prisma transaction and marks failed `ImportRun` records as `FAILED`.
  - Weekly schedule import uses a Prisma transaction and marks failed `ImportRun` records as `FAILED`.
- [ ] Add rollback strategy.
- [ ] Import scope defaults: last month and future dates.

## 5. Business Rules

- [ ] Normalize LKW statuses.
- [ ] Hide sold/returned/inactive LKW from normal planning on selected date.
- [ ] Show workshop LKW as blocked/problem when needed.
- [ ] Allow multiple Runde per LKW per day.
- [x] Mark same LKW same Runde conflict as Problem.
  - Assignment write API checks same date/Runde LKW conflicts.
- [ ] Normalize driver statuses.
- [ ] Hide dismissed drivers after dismissal date.
- [x] Check daily vacation/sick availability.
  - Imported reporting weekly U/K rows are expanded into daily `DriverAvailability` rows.
- [x] Mark unavailable driver assignment as Problem.
  - Current import marks existing assignments and linked orders as `PROBLEM` when the assigned driver is unavailable.
  - Assignment write API checks imported daily driver availability.
- [ ] Holiday warning for Germany/Hamburg.
- [ ] Do not block saving on Problem in MVP.

## 6. Frontend

- [x] Initial Next.js shell added.
- [x] Login page.
  - Root page now shows a login form and uses the API session cookie.
- [x] Dashboard with real counters.
  - Counters are loaded from `GET /api/planning/day`.
- [x] Tagesplanung page.
  - Root page includes the MVP Tagesplanung read view.
- [x] LKW-first table starting with LKW column.
  - The first table column is LKW.
- [ ] Orders-first mode.
- [~] Filters: date, week, month, company, LKW, driver, status, Runde.
  - Date filter is implemented; other filters are pending.
- [x] Conflict/problem indicators.
  - Problem rows are highlighted and problem status is shown.
- [ ] Holiday warning banner.
- [ ] LKW management page.
- [ ] Driver management page.
- [~] Import page with preview.
  - Root UI now includes import cards for reporting master data, weekly schedules, and driver availability.
- [ ] Audit Log page.
- [ ] User management page.
- [ ] Settings page.

## 7. Exports

- [ ] PDF Tagesplan.
- [x] Excel Tagesplan.
  - MVP exports CSV with Excel-compatible UTF-8 BOM and semicolon separator.
- [ ] PDF Wochenplan.
- [ ] Excel Wochenplan.
- [~] Export respects filters.
  - Date filter is supported; other UI filters are pending.
- [x] Export log records created.

## 8. Operations

- [x] Backup script draft added.
- [ ] Daily PostgreSQL backup job.
- [ ] Backup stored outside main VPS.
- [ ] Backup retention configured.
- [ ] Monthly restore test procedure documented.
- [ ] Healthchecks verified.
- [ ] Docker healthchecks verified.
- [x] Docker healthchecks verified.
  - `lkw_planning_postgres` healthy.
  - `lkw_planning_api` healthy.
  - `lkw_planning_migrate` exited 0.
  - `lkw_planning_seed` exited 0.
- [ ] Log rotation configured.
- [ ] Hetzner deployment notes.
- [ ] Cloudflare DNS/SSL notes.

## 9. Manual Decisions Needed

- [x] Choose DB isolation: separate database `lkw_planning`.
- [x] Confirm exact daily Tagesplan Excel source sheet/file.
- [~] Confirm `Wagen` -> LKW alias rules for short numbers like `411`, `4235`.
  - Confirmed: `411 -> KO-HH411`, `4295 -> WI-QY4295`.
  - Still needs full alias import table from LKW master data for all edge cases.
- [manual] Confirm meaning of green/red status icons in Tagesplan.
- [manual] Confirm if MVP UI should show exactly 3 Runde or allow dynamic Runde count.
- [x] Confirm first Admin user email for seed script: `a.samosvat@groo.de`.
- [manual] `npm audit --omit=dev` still reports 2 moderate advisories in `next -> postcss`; npm currently reports no non-forced fix.

## 10. Phase 2

- [ ] Full chassis management.
- [ ] Telegram driver plan lookup.
- [ ] Accounting/order system integration.
- [ ] External order number sync.
- [ ] Advanced mobile view.
- [ ] Automatic LKW suggestions.
- [ ] Advanced KPI dashboard.
