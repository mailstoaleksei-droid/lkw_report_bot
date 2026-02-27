# Excel Data Map (Phase 1.1)

Updated: 2026-02-16

## Sources analyzed

- `%TEMP%\LKW_Fahrer_Data.xlsm` (safe copy)
- `%TEMP%\LKW_Fahrer_Plan.xlsb` (safe copy)

Notes:
- Primary file path from `.env` (`EXCEL_FILE_PATH`) was locked by Excel, so read-only analysis used temp copies.
- Analysis was read-only (no workbook changes).

## Core entities for SQL

### 1) Trucks master

Primary source sheet: `LKW` (`LKW_Fahrer_Data.xlsm`)

Key columns:
- `LKW-ID` -> `trucks.external_id`
- `LKW-Nummer` -> `trucks.plate_number`
- `LKW-Typ` -> `trucks.truck_type`
- `Firma` -> `companies.name` (lookup) + `trucks.company_id`
- `Status` -> `trucks.status`
- `Datum verkauft` -> `trucks.status_since`

Supporting source:
- `Data_Kalender` has additional `LKW-ID`, `LKW-Nummer`, `Status`, `Firma`.

### 2) Drivers master

Primary source sheet: `Fahrer` (`LKW_Fahrer_Data.xlsm`)

Key columns:
- `Fahrer-ID` -> `drivers.external_id`
- `Fahrername` -> `drivers.full_name`
- `Firma` -> `companies.name` (lookup) + `drivers.company_id`
- `Telefonnummer` -> `drivers.phone`
- `Status` + `Datum entlassen` -> `drivers.is_active` logic

Supporting source:
- `Data_Kalender` includes `Fahrer-ID`, `Fahrername` pairings.

### 3) Weekly schedule assignments

Primary source sheet: `Fahrer-Arbeitsplan` (`LKW_Fahrer_Plan.xlsb`)

Observed layout:
- Row 2: years by week columns.
- Row 3: ISO week numbers by columns.
- Columns A-E: truck metadata (`LKW-ID`, `LKW-Nummer`, ...).
- From column F onward: assignment values (driver name/status text) by week.

Target SQL:
- Parse each non-empty assignment cell into `schedules`.
- Set `iso_year`, `iso_week`, `truck_id`.
- `assignment_type`/`shift_code` from raw cell text.
- Save original text into `raw_payload`.

### 4) Vacation / constraints

Source sheet: `Urlaub` (`LKW_Fahrer_Data.xlsm`)

Observed layout:
- Row 4 contains metadata headers (`Fahrer-ID`, `Fahrername`, `Firma`, ... + weekdays).
- Row 5 contains week mapping (`KW` + week numbers).
- Grid stores daily vacation/status marks (`U`, `K`, etc.).

Target usage:
- Phase 1 ETL may store vacation marks in `schedules.raw_payload` initially.
- Optional normalization later (separate `vacations` table).

## Other data domains (next ETL waves)

These sheets are available but not required for first SQL report MVP:
- `Repair`
- `Tankkarten`
- `Toll Collect`
- `YF`
- `Carlo`
- `Contado`
- `Staack`
- `Shell`
- `DKV`
- `Genset`
- `Bonus`, `BonusCalc`

Already integrated into SQL ETL/reporting:
- `BonusDynamik` -> `report_bonus_dynamik_monthly`

## Relation model (initial)

- `companies` 1->N `trucks`
- `companies` 1->N `drivers`
- `trucks` 1->N `schedules`
- `drivers` 1->N `schedules`
- ETL run metadata in `etl_log`
- Report execution metadata in `reports_log`

## Parsing risks to handle in ETL

- Mixed language headers (DE/EN) and duplicate semantic columns.
- Special assignment text patterns in schedule cells (e.g., driver + status, arrows, slash).
- Date serials / formatted date text inconsistencies.
- Locked workbook and temporary copy strategy for stable reads.
