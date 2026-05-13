# Export API MVP

## Purpose

The planning app can export the selected Tagesplanung date as CSV for Excel.

## Endpoint

```http
GET /api/exports/tagesplanung.csv?date=2026-05-04
```

The endpoint requires an authenticated user with at least `VIEWER` role.

## Exported Columns

- LKW
- LKW status
- Driver
- Driver status
- Chassis
- Runde
- Auftrag
- Customer
- PLZ
- City
- Country
- Time
- Info
- Status
- Problem

## UI

The web UI has an `Export CSV` button near the planning date filter.

## Logging

Each export creates an `ExportLog` row with:

- export type
- format
- selected filters
- output filename
- user id

## Verification

Verified on 2026-05-13:

- `npm run build --workspace @lkw-planning/api` passed
- `npm run build --workspace @lkw-planning/web` passed
- Docker Compose rebuild passed
