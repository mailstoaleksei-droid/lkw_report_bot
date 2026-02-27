# LKW Telegram Mini App - Implementation Checklist

> Last updated: 2026-02-27
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
  - chart by `Gesamt`
  - trend arrows shown only when both adjacent months have data
  - in-bar data labels are vertical and integer-formatted (thousand grouping)
- [x] `Bonus` (monthly driver bonus)
  - params: `year`, `month`, optional `Fahrer ID / surname`
  - source: `BonusDynamik` via SQL (`report_bonus_dynamik_monthly`)
  - PDF: landscape table + KPI summary + chart `Top Fahrer by Final`
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
