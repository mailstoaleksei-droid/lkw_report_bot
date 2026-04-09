# LKW Telegram Mini App - Implementation Checklist

> Last updated: 2026-04-09
> Status legend: [ ] pending | [~] in progress | [x] done

## 1) Infra and Deploy
- [x] Cloudflare Pages + production domain configured
  - Active app URL: `https://groo-webapp.app`
- [x] Git auto-deploy from `main`
- [x] Telegram `Open App` synchronized via `sync_telegram_profile.py`
  - Current versioned URL synced in bot profile/menu

## 2) Security and Access
- [x] Telegram `initData` HMAC validation in Worker
- [x] Access control moved to DB table `allowed_users`
- [x] Env whitelist fallback removed in Worker auth flow
- [x] Access granted and verified for active users (including `5704951140`, `6863783942`)
- [x] Per-user API rate limit enabled

## 3) SQL-First Data Pipeline
- [x] SQL-first architecture is active (no Excel generation in runtime)
- [x] ETL `.xlsm` import: companies, trucks, drivers
- [x] ETL `.xlsb` import: schedules/assignments
- [x] ETL import for `Bericht_Dispo` added:
  - table: `report_einnahmen_monthly`
  - metrics: `Nahverkehr`, `Logistics`, `Gesamt`
- [x] ETL import for `BonusDynamik` added:
  - table: `report_bonus_dynamik_monthly`
  - columns: `ID`, `Fahrer`, `Days`, `KM`, `%KM`, `CT`, `%CT`, `Bonus`, `Penalty`, `Final`
- [x] ETL import for `Diesel` added:
  - table: `report_diesel_monthly`
  - columns: liters / euro / euro per liter
- [~] ETL import for `YF_Fahrer` and `YF` is being added:
  - tables drafted: `report_yf_fahrer_monthly`, `report_yf_lkw_daily`
  - parser + Worker integration drafted
  - pending: final ETL completion and production verification on live workbook data
- [x] ETL freshness monitor active (`ETL_STALE_AFTER_HOURS=4`)
- [x] ETL schedule updated:
  - Day: hourly (07:00-18:00)
  - Night: every 3 hours (21:00-06:00)

## 4) Reports Implemented in Mini App
- [x] `Bericht` (year/week)
- [x] `Data/Plan -> Plan` (selected week + 3 weeks)
- [x] `Data/Plan -> Data` (selected week, 7 days)
- [x] `Einnahmen` (monthly revenue)
  - columns: `Monat`, `Nahverkehr`, `Logistics`, `Gesamt`
  - table values centered
  - `Gesamt` column enlarged and bold
  - zero values hidden
  - chart simplified: no side scales / no extra legend rows / labels horizontal
- [x] `Diesel` (monthly fuel costs)
  - source snapshot from sheet ranges:
    - page 1: `A1:R26`
    - page 2: `T1:AL26`
  - chart removed
  - centered values
  - `Km`, `Total`, `Average` emphasized
  - `LKW Karte` PDF added inside Diesel block:
    - select one LKW
    - columns: `LKW-ID`, `LKW-Nummer`, `DKV Card`, `Shell Card`, `Tankpool Card`
    - zero values hidden
- [x] `Bonus` (monthly driver bonus)
  - params: `year`, `month`, optional `Fahrer`
  - source: `BonusDynamik` via SQL (`report_bonus_dynamik_monthly`)
  - monthly PDF without chart
  - table centered
  - `Final` emphasized
  - zero values hidden
- [x] `Bonus` (whole year)
  - separate block in mini app
  - columns: `ID`, `Fahrer`, `Jan..Dec Final`, yearly cumulative total
- [x] `LKW`
  - `1 LKW` PDF
  - `Alle LKW` PDF
  - source: sheet `LKW`
  - columns: `A-G`, `L-Z`
  - centered values
  - zero values hidden
  - row colors:
    - sold truck -> grey
    - `Container` -> light brown
    - `Planen` -> light violet
- [~] `Yellow Fox`
  - mini app UI for two PDF reports drafted
  - report 1: driver/month from `YF_Fahrer`
  - report 2: LKW/week from `YF`
  - pending: final ETL load + production check
- [x] `Data/Plan`
  - table values centered
  - special labels highlighted:
    - `O.F.`
    - `Verkauft`
    - `Werkstatt`
    - `Werkstattwagen`
  - `U` after driver name highlighted orange
  - bottom statistics/chart removed
- [x] Bottom dock SQL PDFs:
  - `LKW`
  - `Fahrer`
  - `Tankkarte`

## 5) History and UX
- [x] History list from `reports_log`
- [x] Open report from history
- [x] Delete selected / delete all history entries
- [x] Top action buttons:
  - Gear -> show Telegram user ID
  - Bell -> show last ETL update times

## 6) Remaining Work (Planned)
- [~] Additional report family rollout:
  - `Yellow Fox` final ETL/data verification
  - `Fahrerzeiten`
  - `Urlaubsplan`
  - other business reports to be finalized
- [ ] Optional PDF caching layer (R2/KV)
- [ ] Browser-rendering fallback if needed for complex PDF layouts
- [ ] Full cleanup of legacy local-server/Excel-COM paths (if decommission approved)

## 7) Control Result
- [x] User opens Telegram -> `Open App`
- [x] Mini App loads production UI
- [x] SQL report generation returns PDF in-app
- [x] Data freshness and ETL status are visible in Mini App
