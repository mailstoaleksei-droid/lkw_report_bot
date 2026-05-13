# Reporting Master Import

## Purpose

The planning app can import LKW, Fahrer, and company master data from the existing reporting PostgreSQL database.

The existing Telegram Mini App, bot, and ETL process remain untouched. The planning app only reads from the reporting database and writes into its own `lkw_planning` database.

## Source Tables

- `companies`
- `trucks`
- `drivers`

Current inspected source volume:

- companies: 14
- trucks: 85
- importable trucks: 78
- skipped truck placeholder rows: 7
- drivers: 92

Skipped truck rows currently have no `plate_number`, for example `L008`, `L060`, `L061`, `L082`, `L083`, `L084`, and `L085`.

## API Endpoints

Preview without writing data:

```http
GET /api/imports/reporting-master-data/preview
```

Execute upsert import:

```http
POST /api/imports/reporting-master-data/execute
Content-Type: application/json

{}
```

## Imported Data

Companies:
- name
- code
- active flag

LKW:
- external reporting ID
- LKW number
- type
- company
- status
- sold/returned date when available
- raw source payload

Drivers:
- external reporting ID
- full name
- surname
- phone
- company
- status
- dismissal date when available
- raw source payload

LKW aliases are created for daily plan matching, for example:

- `GR-OO2206` -> `2206`
- `KO-HH411` -> `411`
- `WI-QY4295` -> `4295`

## Safety

- Preview does not write data.
- Execute uses upsert operations, so repeated imports update existing master data.
- The import creates an `ImportRun` record.
- Successful execution creates an `AuditLog` entry.
- Failed execution marks the `ImportRun` as `FAILED`.

## Verification

Verified locally on 2026-05-13:

- local service import into `lkw_planning`: 14 companies, 78 LKW, 157 aliases, 92 drivers
- Docker API preview: `GET /api/imports/reporting-master-data/preview` returned 200
- Docker API execute: `POST /api/imports/reporting-master-data/execute` returned 200
