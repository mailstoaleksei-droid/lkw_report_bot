# LKW Telegram Mini App - Implementation Checklist

> Last updated: 2026-04-20
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
- [x] Access granted and verified for active users (including `5704951140`, `6863783942`, `8684182333`, `997894789`, `8594957192`)
- [x] Per-user API rate limit enabled
- [x] Mini App access UX distinguishes real `Access denied` from transient Telegram session/auth errors

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
- [x] ETL import for `YF_Fahrer` and `YF` added:
  - tables: `report_yf_fahrer_monthly`, `report_yf_lkw_daily`
  - parser + Worker integration active
  - ETL verified on live workbook data
- [x] ETL freshness monitor active (`ETL_STALE_AFTER_HOURS=4`)
- [x] ETL schedule updated:
  - Day: hourly (07:00-18:00)
  - Night periodic ETL disabled to reduce load
  - Source-change watcher limited to 07:00-18:00
  - Freshness monitor limited to 07:00-18:00
- [x] ETL stale lock recovery added:
  - dead PID lock is auto-removed on next run
  - invalid/corrupted lock file is auto-removed
  - long-running active ETL still remains protected by lock

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
- [x] `Yellow Fox`
  - report 1: driver/month from `YF_Fahrer`
    - params: `month`, `Fahrer`
    - columns: `Month`, `Fahrer`, `Distanz`, `Aktivitätsdauer`, `Fahrzeit`, `Inaktivitätszeit`
  - report 2: LKW/week from `YF`
    - params: `year`, `week`, `LKW`
    - columns: `Year`, `Month`, `Week`, `LKW`, `Datum`, `dayweek`, `Strecke`, `Kilometerstand Start`, `Kilometerstand Ende`, `Drivers final`
  - report 3: LKW/month from `YF`
    - params: `year`, `month`, `LKW`
    - daily driver value taken from column `Y` / `Drivers final`
    - workday rule: idle only when `0 <= Strecke < 50 km`
    - kilometer anomalies (`< 0` or unusually high daily mileage `> 2000 km`) are listed separately and still counted as workdays
    - PDF includes monthly summary, idle days, weekend flag, anomaly note, and daily detail table
    - `Fahrzeug / Fahrer / Zeitraum` line emphasized in bold and larger font
    - `Regel` and `Datenhinweis` note blocks left-aligned with centered vertical placement
    - table values centered
  - centered table layout
  - live ETL data loaded and verified
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
- [x] Report selection flow opens in Telegram Fullsize style:
  - tile submenus open as fullsize sheets inside the Mini App viewport
  - report criteria screens remain fullsize on next steps
- [x] Report tiles remain clickable even when access badge shows a warning state
- [x] Report tile handlers are wired before access/API checks so slow `/api/meta` does not block opening menus
- [x] Mini App report UI adjusted for Telegram Fullsize launch mode:
  - browser Fullscreen request removed; Telegram `expand()` remains
  - main and submenu background changed to light grey glass theme
  - sheet badge (`PDF`) removed; back/close action is placed in the former badge position
  - bottom dock shortcuts styled as four light grey liquid-glass tiles
  - top report info button added with clickable descriptions of available reports
  - dock reports (`LKW`, `Fahrer`, `Tankkarten`) added to the clickable `Available Reports` list
  - report info navigation preserves back context: info list -> report -> info list, main menu -> report -> main menu
  - back/close action uses a compact modern graphite minimalist button style
  - submenu labels and notes use dark grey text
  - report parameter labels use light-blue highlighting; select values/placeholders use blue text
  - main report tiles use dedicated icons: Bericht inline play triangle, Data/Plan inline calendar, Yellow Fox inline fox face, Einnahmen rising chart, Bonus inline money bag
  - generated PDF result view shows only `Open PDF` and `Save PDF` buttons with blue highlighted field-style controls
  - `Available Reports` and report submenu hints use updated Russian business descriptions for all main, dock, and history entries
  - Mini App language follows Telegram/browser locale with `de`, `ru`, and `en` dictionaries; hardcoded report UI strings were moved into localization
  - English localization no longer mixes Russian report descriptions when the selected language is `en`
  - submenu report choice cards no longer show `Choose report`; Data/Plan Plan/Data descriptions are expanded and localized
  - Data/Plan criteria screens render multiline header hints correctly and no longer duplicate the hint in the lower note area
  - second-step submenu screens include the selected report type in the header, e.g. `Data/Plan - Data` and `Data/Plan - Plan`
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
