# Export API MVP

## Purpose

The planning app can export Tagesplan and Wochenplan data as Excel-compatible `.xls` and MVP PDF files.

## Endpoints

The endpoints require an authenticated user with at least `VIEWER` role.

```http
GET /api/exports/tagesplanung.xls?date=2026-05-04&scope=day
GET /api/exports/tagesplanung.pdf?date=2026-05-04&scope=day
GET /api/exports/wochenplan.xls?date=2026-05-04
GET /api/exports/wochenplan.pdf?date=2026-05-04
```

`tagesplanung` supports `scope=day`, `scope=week`, and `scope=month`.
`wochenplan` always exports the Monday-Sunday week containing the selected date.

Optional filters:

```http
GET /api/exports/wochenplan.xls?date=2026-05-04&auftrag=123&lkw=GR-OO&driver=Alex&company=Groo&status=PLANNED&runde=1
```

Supported export filters:

- date
- scope for Tagesplanung endpoints
- Auftrag contains
- LKW number contains
- empty LKW filter
- driver name contains
- company contains
- status exact match
- Runde exact match

## Exported Columns

- LKW
- Runde
- Auftrag
- Driver
- Chassis
- Customer
- PLZ
- City
- Country
- Time
- Info
- Status
- Problem

## UI

The web UI has compact `Export Excel` and `Export PDF` buttons in the planning date tile. Exports use the current planning date, period, Auftrag, LKW, empty LKW, driver, company, status, and Runde filters from the Tagesplanung view.

## Logging

Each export creates an `ExportLog` row with:

- export type
- format
- selected filters
- output filename
- user id

## Verification

Verified on 2026-05-15:

- `npm run build --workspace @lkw-planning/api` passed
- Docker Compose API rebuild passed
