# Reporting Driver Availability Import

## Purpose

The planning app imports driver vacation and sick availability from the existing reporting PostgreSQL database into the isolated `lkw_planning` database.

The existing Telegram Mini App, bot, and ETL process remain untouched. The planning app reads `report_fahrer_weekly_status` and writes daily `DriverAvailability` rows.

## Source Table

- `report_fahrer_weekly_status`

Current inspected source volume:

- weekly U/K rows: 816
- vacation weeks: 787
- sick weeks: 29
- missing driver mappings: 0

Current source date range:

- from: `2025-12-01`
- to: `2026-12-27`

## API Endpoints

Preview without writing data:

```http
GET /api/imports/reporting-driver-availability/preview
```

Execute import:

```http
POST /api/imports/reporting-driver-availability/execute
Content-Type: application/json

{}
```

## Imported Data

The reporting source stores U/K by ISO week. The planning app expands each U/K week into seven daily rows:

- `U` -> `VACATION`
- `K` -> `SICK`

Imported rows use:

- source: `reporting-db-weekly-status`
- driver mapping by reporting `fahrer_id`
- date: each calendar day from `week_start` to `week_end`
- raw source payload for traceability

## Conflict Marking

After availability import, the app checks existing assignments:

- if an assignment driver is unavailable on the planning date, the assignment is marked `PROBLEM`
- the linked order is also marked `PROBLEM`
- saving is not blocked; the problem is visible for manual review

Current verified result:

- 5712 daily availability rows imported
- 15 assignments marked `PROBLEM`
- 15 orders marked `PROBLEM`

## Safety

- Preview does not write data.
- Execute replaces previous `reporting-db-weekly-status` availability rows before inserting current rows.
- Execute runs inside one Prisma transaction.
- Failed execution marks the `ImportRun` as `FAILED`.
- Successful execution creates an `AuditLog` entry.

## Verification

Verified locally on 2026-05-13:

- local service preview returned date range `2025-12-01` to `2026-12-27`
- local service execute imported 5712 availability days
- local service execute marked 15 assignments and 15 orders as `PROBLEM`
- Docker API preview returned 200
- Docker API execute returned 200
- Docker PostgreSQL contains 5712 rows with source `reporting-db-weekly-status`
