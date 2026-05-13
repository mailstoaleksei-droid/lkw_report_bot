# Export API MVP

## Purpose

The planning app can export the selected Tagesplanung date as Excel-compatible `.xls`.

## Endpoint

```http
GET /api/exports/tagesplanung.xls?date=2026-05-04
```

The endpoint requires an authenticated user with at least `VIEWER` role.

Optional filters:

```http
GET /api/exports/tagesplanung.xls?date=2026-05-04&lkw=GR-OO&driver=Alex&status=PLANNED&runde=1
```

Supported export filters:

- date
- LKW number contains
- driver name contains
- status exact match
- Runde exact match

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

The web UI has an `Export Excel` button near the planning date filter. The export uses the current LKW, driver, status, and Runde filters from the Tagesplanung view.

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
