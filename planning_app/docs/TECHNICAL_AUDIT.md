# Existing System Technical Audit

Audit date: 2026-05-12

## Repositories And Folders

Current Git repository:
- Path: `lkw_report_bot`
- Remote: `https://github.com/mailstoaleksei-droid/lkw_report_bot.git`
- Branch: `main`

Important folders:
- `miniapp/`: Cloudflare Pages static app and Worker API.
- `sql/`: existing reporting schema bootstrap.
- `tests/`: Python tests for bot, ETL, scheduler, and reporting.
- `LKW_Fahrer_Data/`: exported VBA modules from the data workbook.
- `LKW_Fahrer_Plan/`: exported VBA modules from the planning workbook.
- `docs/`: existing reporting and Mini App documentation.
- `planning_app/`: new isolated planning app skeleton.

Parent folder data sources:
- `LKW_Fahrer_Data.xlsm`
- `LKW_Fahrer_Plan.xlsb`
- `data/Kontakti vaditelei.xlsx`
- `Fahrer in Kalender/LKW_Fahrer_Data.xlsm`
- `Fahrer in Kalender/LKW_Fahrer_Plan_.xlsb`

## Existing Telegram Mini App

Related files:
- `miniapp/index.html`
- `miniapp/_worker.js`
- `miniapp/_headers`
- `miniapp/vendor/pdf-lib.esm.js`
- `miniapp/icons/*`

Technology:
- Cloudflare Pages advanced Worker file.
- Static HTML/CSS/JavaScript frontend.
- Direct Neon PostgreSQL HTTP SQL calls from Worker.
- Telegram initData validation inside Worker.
- PDF generation in Worker using pdf-lib and fallback PDF helpers.

This code must remain untouched for the planning MVP except for explicit bug fixes.

## Existing Telegram Bot And Reporting

Related files:
- `bot.py`
- `run_bot.cmd`
- `stop_bot.cmd`
- `watchdog.ps1`
- `scheduler.py`
- `report_config.py`
- `web_server.py`
- `sync_telegram_profile.py`
- `refresh_tunnel.py`

Technology:
- Python.
- `python-telegram-bot`.
- `aiohttp` local web server for older/local app mode.
- Windows Task Scheduler scripts.
- Cloudflare quick tunnel helper.

Reporting now mostly runs SQL-first through Cloudflare Worker and Neon. The bot remains important for Telegram entry points, profile/menu sync, and future Telegram workflows.

## Existing ETL

Related files:
- `etl_xlsm_to_postgres.py`
- `etl_xlsb_to_postgres.py`
- `etl_sim_cards_to_postgres.py`
- `run_etl_pipeline.py`
- `check_etl_freshness.py`
- `etl_watch_sources.py`

Technology:
- Python.
- `openpyxl` for `.xlsm`.
- `pyxlsb` for `.xlsb`.
- `psycopg` for PostgreSQL.
- Windows Task Scheduler.

Existing ETL should be treated as reporting ETL, not planning write logic.

## Current Backend Technology

There is no existing Node.js backend for the planning domain in this repo.

Current backend pieces are:
- Python bot and automation scripts.
- Cloudflare Worker in `miniapp/_worker.js`.
- PostgreSQL/Neon as the reporting database.

The new planning app should introduce its own Node.js API package.

## Current Database

Existing connection:
- Environment variable: `DATABASE_URL`
- Used by Python ETL, Python bot utilities, and Cloudflare Worker.
- Actual secret value was not copied into documentation.

Observed schemas:
- `public`
- `repair`

Observed public tables:
- `allowed_users`
- `companies`
- `drivers`
- `etl_log`
- `miniapp_action_queue`
- `report_bonus_dynamik_monthly`
- `report_diesel_monthly`
- `report_einnahmen_firm_monthly`
- `report_einnahmen_monthly`
- `report_fahrer_weekly_status`
- `report_lkw_fuel_transactions`
- `report_lkw_revenue_records`
- `report_repair_records`
- `report_sim_contado`
- `report_sim_vodafone`
- `report_tankkarten_driver_cards`
- `report_yf_fahrer_monthly`
- `report_yf_lkw_daily`
- `reports_log`
- `schedules`
- `trucks`

Observed repair tables:
- `repair.invoices`
- `repair.processing_log`

Approximate key row counts at audit:
- `companies`: 14
- `trucks`: 85
- `drivers`: 92
- `schedules`: 2135
- `report_fahrer_weekly_status`: 5096
- `reports_log`: 267

Recommendation:
- Do not write planning data into these reporting tables.
- Use a separate database `lkw_planning` or schema `planning`.

## Existing Excel Files And Sheets

`LKW_Fahrer_Data.xlsm` direct read was locked during audit. Safe temp copy was available and readable.

Observed sheets in `LKW_Fahrer_Data.xlsm`:
- `instructions`
- `Data_Kalender`
- `Bericht`
- `Kalender`
- `LKW`
- `Fahrer`
- `Urlaub`
- `Repair`
- `Tankkarten`
- `HU SP 57B`
- `Ilona`
- `Bonus`
- `BonusCalc`
- `BonusDynamik`
- `YF_Fahrer`
- `Fahrzeuganalyse`
- `CT`
- `Quality indicators LKW`
- `LIT`
- `MENU`
- `Alenada`
- `Adepot`
- `Toll Collect`
- `Fuhrpark`
- `YF`
- `Carlo`
- `Contado`
- `Staack`
- `Shell`
- `DKV`
- `Genset`
- `Diesel`
- `Bericht_Dispo`
- `Daten_Dispo`

Observed sheets in `LKW_Fahrer_Plan.xlsb`:
- `Fahrer-Arbeitsplan`
- `Config`
- `DropdownLists`

Importable for MVP:
- `LKW`: LKW master data.
- `Fahrer`: driver master data and dismissal/vacation summary fields.
- `Urlaub`: vacation/sick daily grid.
- `Fahrer-Arbeitsplan`: existing future planning and last-month planning import.

Importable later:
- `Repair`, `Tankkarten`, `YF`, `Carlo`, `Contado`, `Staack`, `Shell`, `DKV`, `Genset`, `Diesel`, `Bericht_Dispo`.

## Reusable Code

Safe to reuse by copying concepts, not by coupling runtime:
- Excel safe-copy strategy from current ETL.
- Header normalization and sheet parsing patterns from `etl_xlsm_to_postgres.py`.
- XLSB parsing approach from `etl_xlsb_to_postgres.py`.
- Status/date normalization ideas.
- Existing PostgreSQL reporting table knowledge for migration mapping.
- Cloudflare DNS/SSL deployment pattern.
- Telegram auth and bot workflow knowledge for phase 2.

## Code That Should Stay Separated

Do not modify for MVP planning:
- `miniapp/`
- `bot.py`
- existing ETL scripts
- current `public` reporting tables
- current Telegram bot token and Mini App secrets
- current Yellow Fox automation

## Recommended Repository Strategy

Short term:
- Keep `planning_app/` as a separate app folder in the existing repo while the MVP is being designed.
- This allows reuse of local knowledge and Excel samples without touching the reporting app.

Production-ready option:
- Move `planning_app/` to its own repository once MVP boundaries are stable.
- Keep a read-only integration contract from reporting to planning, not shared mutable tables.

## Migration Path

1. Build planning schema in separate database/schema.
2. Implement import preview for LKW, Fahrer, Urlaub/Krank, last month, and future plans.
3. Run imports into staging tables/preview payloads first.
4. Validate duplicates, statuses, missing LKW/drivers, and conflicts.
5. Execute imports in transactions.
6. Compare dashboards against Excel outputs.
7. Let operators use the web app in parallel with Excel for a trial period.
8. Freeze Excel planning writes only after sign-off.
9. Keep reporting Mini App live and unchanged.

## Risks

- Excel files can be locked by Excel or SharePoint sync.
- Existing reporting DB has stale `running` ETL log rows.
- Existing repo has many unrelated dirty/untracked files.
- Direct coupling to reporting tables would risk breaking Mini App reports.
- Duplicate bot supervisor processes were found and fixed separately.
- Status values are mixed language and need normalization before business rules.

