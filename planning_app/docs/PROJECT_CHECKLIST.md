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
- [x] Add user management endpoints.
  - Admin-only list/create/update endpoints are implemented.
  - API blocks self role downgrade and self deactivation.
  - Admin can reset a user's password to a new temporary password.
  - New and reset temporary passwords force the user to create a new password after login.
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
  - Audit endpoint requires Manager/Admin.
- [~] Add import endpoints.
  - Import preview endpoints require Manager/Admin.
  - Import execute endpoints require Admin.
- [x] Add export endpoints.
  - `GET /api/exports/tagesplanung.xls?date=YYYY-MM-DD` exports Tagesplanung rows for Excel.
  - `GET /api/exports/tagesplanung.pdf?date=YYYY-MM-DD` exports Tagesplanung rows for PDF.
- [~] Add holiday endpoints.
  - Planning day response now includes computed Germany/Hamburg holiday warnings.

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
- [~] Import `Kalender` LKW-driver pairings from `LKW_Fahrer_Data.xlsm`.
  - MVP pairing table added in the planning database.
  - Current import derives date-specific LKW-driver pairings from imported planning assignments.
  - Direct `Kalender` sheet parsing from `LKW_Fahrer_Data.xlsm` remains pending as the Excel fallback source.
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

- [x] Normalize LKW statuses.
  - Status normalization module maps known raw status variants into planning enums.
- [x] Hide sold/returned/inactive LKW from normal planning on selected date.
  - LKW availability is date-aware: sold/returned LKW can still be used before their sold/returned date.
- [ ] Show workshop LKW as blocked/problem when needed.
- [x] Allow multiple Runde per LKW per day.
  - Assignment conflicts block only the same LKW in the same date/Runde.
- [x] Mark same LKW same Runde conflict as Problem.
  - Assignment write API checks same date/Runde LKW conflicts.
- [x] Normalize driver statuses.
  - Status normalization module maps known raw status variants into planning enums.
- [x] Hide dismissed drivers after dismissal date.
  - Driver availability is date-aware: dismissed drivers can still be used before their dismissal date.
- [x] Check daily vacation/sick availability.
  - Imported reporting weekly U/K rows are expanded into daily `DriverAvailability` rows.
- [x] Mark unavailable driver assignment as Problem.
  - Current import marks existing assignments and linked orders as `PROBLEM` when the assigned driver is unavailable.
  - Assignment write API checks imported daily driver availability.
- [x] Holiday warning for Germany/Hamburg.
  - Planning day response returns computed DE/HH holiday warnings for the selected date.
- [x] Do not block saving on Problem in MVP.
  - Assignment API saves records and marks assignment/order as `PROBLEM` instead of rejecting conflict cases.

## 6. Frontend

- [x] Initial Next.js shell added.
- [x] Login page.
  - Root page now shows a login form and uses the API session cookie.
- [~] Localization.
  - UI detects browser/system language on first open.
  - Manual language switcher added for German, English, and Russian.
  - Selected language is saved in browser local storage.
  - Core planning, import, management, audit, and user-management labels are translated.
- [x] Dashboard with real counters.
  - Counters are loaded from `GET /api/planning/day`.
  - Dashboard counters are embedded under the Tagesplanung filter tile.
  - Dashboard was removed as a separate top navigation tab to keep the planner compact.
  - Dashboard shows total orders, active orders, assigned orders, assigned LKW, free LKW, LKW usage, and problems.
  - Filter and dashboard tiles were compacted to reduce planning page height.
- [x] Tagesplanung page.
  - Root page includes the MVP Tagesplanung read view.
- [x] LKW-first table starting with LKW column.
  - The first table column is LKW.
  - The LKW-first table is now the assignment view for created orders.
  - The LKW-first table includes created orders even when no LKW/driver has been assigned yet.
  - Only LKW and driver are editable in LKW-first.
  - The Time column is hidden in LKW-first.
  - LKW status and driver check columns were removed from the planning table.
  - Operators/Admins mark a row as assigned from the right-side action column; this saves LKW/driver and sets the order to `DONE`.
  - Assigned rows move into the `Assigned orders` block for viewing.
  - Tagesplanung rows were compacted to one-line height so more LKW/orders fit on one screen.
  - The planner subtitle was replaced with a centered highlighted planning date.
- [x] Orders-first mode.
  - Web UI can switch between LKW-first and Orders-first tables.
  - Orders-first view includes assigned and unassigned orders for the selected date.
  - Operators/Admins create and edit order data from the Orders-first table.
  - LKW and driver assignment is intentionally removed from Orders-first and handled only in LKW-first.
  - LKW-first dropdowns hide LKW and drivers already assigned in the same Runde.
  - Driver dropdowns hide drivers who are on imported vacation/sick status for the selected planning date.
  - Selecting a LKW auto-fills the driver when a same-date LKW-driver pairing is already known.
  - LKW-driver pairings are now persisted in the planning database and returned by the planning API.
  - Orders can be edited inline, including Runde, Auftrag, customer, country, and info.
  - Orders-first hides PLZ, city, and time in the main table.
  - Orders can be edited and soft-deleted from the Orders-first table.
  - Orders-first action column is at the right edge and includes `Save` and `Delete`.
- [~] Filters: date, week, month, Auftrag, company, LKW, driver, status, Runde.
  - Date, week, month, Auftrag, company, LKW, driver, status, and Runde filters are implemented in the web UI.
  - Planning date, Refresh, and Export Excel are grouped in a separate right-side tile next to the filters and dashboard column.
- [x] Conflict/problem indicators.
  - Problem rows are highlighted and problem status is shown.
- [x] Holiday warning banner.
  - Web UI shows a yellow warning banner when the selected date is a Germany/Hamburg holiday.
- [~] LKW management page.
  - Web UI shows a searchable LKW management table from the planning database.
  - LKW management is now separated into its own top-level tab.
  - Edit/create actions are pending.
- [~] Driver management page.
  - Web UI shows a searchable driver management table from the planning database.
  - Driver management is now separated into its own top-level tab.
  - Edit/create actions are pending.
- [~] Import page with preview.
  - Root UI now includes import cards for reporting master data, weekly schedules, and driver availability.
  - Import page includes an LKW-driver pairings card derived from imported assignments.
  - Imports tab is visible only for Manager/Admin; execute buttons are enabled only for Admin.
- [~] Audit Log page.
  - Web UI shows the latest 200 audit events in a searchable table.
  - Order and assignment audit messages include only field-level before/after change summaries for actual changes.
  - Audit rows now show the linked Auftrag when the audit event belongs to an order or assignment.
  - Audit tab is visible only for Manager/Admin.
  - Separate route/page and advanced filters are pending.
- [~] User management page.
  - Admin UI can list users, create users with temporary passwords, change roles, and activate/deactivate users.
  - Admin can toggle visibility for the temporary password while creating a user.
  - Admin can reset a user's password and toggle visibility for the new temporary password.
  - Users with a temporary password are forced into a change-password screen before using the app.
  - Self role change and self deactivation are blocked by API and disabled in UI.
  - Separate route/page is pending.
- [ ] Settings page.

## 7. Exports

- [x] PDF Tagesplan.
  - MVP PDF export is available from the planning action tile.
  - PDF export respects the same planning date/scope and row filters as Excel.
- [x] Excel Tagesplan.
  - MVP exports Excel-compatible XML `.xls` without unsafe third-party XLSX dependencies.
  - Excel export now includes assigned and unassigned Orders-first rows.
- [ ] PDF Wochenplan.
- [ ] Excel Wochenplan.
- [~] Export respects filters.
  - Date filter is supported by the export endpoint.
  - Week/month scope, Auftrag, company, LKW, driver, status, and Runde filters are supported by the Excel export endpoint.
  - PDF Tagesplan uses the same filters as Excel Tagesplan.
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
