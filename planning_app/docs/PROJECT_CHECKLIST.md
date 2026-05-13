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
- [ ] Add role guards.
- [ ] Add user management endpoints.
- [ ] Add LKW endpoints.
- [ ] Add driver endpoints.
- [ ] Add order endpoints.
- [ ] Add assignment endpoints.
- [ ] Add planning query endpoints.
- [ ] Add audit log endpoints.
- [~] Add import endpoints.
- [ ] Add export endpoints.
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
- [ ] Import from existing reporting DB: weekly schedules.
- [ ] Import from Excel `Urlaub`: daily vacation/sick data.
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
- [ ] Add rollback strategy.
- [ ] Import scope defaults: last month and future dates.

## 5. Business Rules

- [ ] Normalize LKW statuses.
- [ ] Hide sold/returned/inactive LKW from normal planning on selected date.
- [ ] Show workshop LKW as blocked/problem when needed.
- [ ] Allow multiple Runde per LKW per day.
- [ ] Mark same LKW same Runde conflict as Problem.
- [ ] Normalize driver statuses.
- [ ] Hide dismissed drivers after dismissal date.
- [ ] Check daily vacation/sick availability.
- [ ] Mark unavailable driver assignment as Problem.
- [ ] Holiday warning for Germany/Hamburg.
- [ ] Do not block saving on Problem in MVP.

## 6. Frontend

- [x] Initial Next.js shell added.
- [ ] Login page.
- [ ] Dashboard with real counters.
- [ ] Tagesplanung page.
- [ ] LKW-first table starting with LKW column.
- [ ] Orders-first mode.
- [ ] Filters: date, week, month, company, LKW, driver, status, Runde.
- [ ] Conflict/problem indicators.
- [ ] Holiday warning banner.
- [ ] LKW management page.
- [ ] Driver management page.
- [ ] Import page with preview.
- [ ] Audit Log page.
- [ ] User management page.
- [ ] Settings page.

## 7. Exports

- [ ] PDF Tagesplan.
- [ ] Excel Tagesplan.
- [ ] PDF Wochenplan.
- [ ] Excel Wochenplan.
- [ ] Export respects filters.
- [ ] Export log records created.

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
