# Reporting Schedule Import

## Purpose

The planning app can import weekly planning assignments from the existing reporting PostgreSQL database into the isolated `lkw_planning` database.

The existing Telegram Mini App, bot, and ETL process remain untouched. This import only reads reporting data and writes planning app orders and assignments.

## Source Tables

- `schedules`
- `companies`
- `trucks`
- `drivers`

Current inspected source volume:

- schedule rows: 2135
- assignment rows imported: 1587
- status rows skipped: 548
- unresolved LKW mappings: 0
- unresolved driver mappings: 0
- rows without resolved driver in source: 12

Current source date range:

- from: `2025-12-01`
- to: `2026-08-24`

## API Endpoints

Preview without writing data:

```http
GET /api/imports/reporting-schedules/preview
```

Execute upsert import:

```http
POST /api/imports/reporting-schedules/execute
Content-Type: application/json

{}
```

## Imported Data

For each reporting schedule assignment row, the import creates or updates:

- one planning `Order`
- one planning `Assignment`

The planning order uses:

- `externalOrderId`: `reporting:schedule:<source id>`
- `planningDate`: source `work_date`
- `runde`: `1`
- `tourType`: `weekly-schedule`
- `description`: source driver or shift label
- `info`: reporting ISO week and year

The assignment uses:

- source LKW mapping by reporting `truck_external_id`
- source driver mapping by reporting `driver_external_id`
- same planning date and Runde as the order
- raw source payload for traceability

## Problem Handling

The import does not discard incomplete assignment rows.

Rows without a resolved LKW or driver are imported with status `PROBLEM`, so they remain visible for manual correction in the planning UI.

Current verified problem rows:

- 12 schedule assignments without resolved driver in the reporting source

## Safety

- Preview does not write data.
- Execute uses upsert by `externalOrderId`, so repeated imports update existing imported schedule orders.
- Assignment rows for the imported order are replaced during re-import.
- Execute runs inside one Prisma transaction.
- Failed execution marks the `ImportRun` as `FAILED`.
- Successful execution creates an `AuditLog` entry.

## Verification

Verified locally on 2026-05-13:

- local service preview returned date range `2025-12-01` to `2026-08-24`
- local service execute applied 1587 orders and 1587 assignments
- local database contains 1587 weekly schedule orders
- local database contains 12 weekly schedule orders with status `PROBLEM`
- Docker API preview returned 200
- Docker API execute returned 200 and applied 1587 orders and 1587 assignments
- Docker PostgreSQL contains 1587 weekly schedule orders
- Docker PostgreSQL contains 12 weekly schedule orders with status `PROBLEM`
