# LKW Report Bot — Checklist

> Last updated: 2026-02-12
> Status legend: [ ] pending | [~] in progress | [x] done | [-] skipped

---

## Phase 0 — Infrastructure (foundation)

- [ ] **0.1** Connect groo.de to Cloudflare
  - Transfer DNS to Cloudflare (if not already), add subdomain `reports.groo.de`
  - Result: DNS managed via Cloudflare dashboard

- [ ] **0.2** Setup Cloudflare Named Tunnel
  - `cloudflared tunnel create lkw-bot`, CNAME `reports.groo.de` -> tunnel
  - Result: permanent URL `https://reports.groo.de`, delete `refresh_tunnel.py`

- [ ] **0.3** Update WEBAPP_URL
  - `.env`: `WEBAPP_URL=https://reports.groo.de`, BotFather -> Mini App URL
  - Result: bot and Mini App use stable domain forever

- [ ] **0.4** UPS for PC
  - Buy UPS (APC Back-UPS 700VA, ~60 EUR)
  - Result: PC survives short power outages

- [ ] **0.5** Bot autostart on PC boot
  - Task Scheduler -> run `run_bot.cmd` at logon
  - Result: bot starts automatically after reboot

---

## Phase 1 — Stability & Monitoring (24/7)

- [ ] **1.1** Subprocess isolation for Excel
  - Move Excel COM into a separate `.py` subprocess with hard `timeout=600`
  - Result: frozen Excel gets killed, bot keeps running

- [ ] **1.2** PDF cache
  - Cache PDF by key `{type}_{year}_{week}` in `%TEMP%/lkw_cache/`, TTL=1h
  - Result: repeated requests served instantly without Excel

- [ ] **1.3** Request size limit
  - `web.Application(client_max_size=64*1024)` in `create_web_app()`
  - Result: protection from oversized JSON payloads

- [ ] **1.4** CORS headers
  - Middleware in `web_server.py`: `Access-Control-Allow-Origin: reports.groo.de`
  - Result: only Mini App can call API

- [ ] **1.5** Admin notification on restart
  - Watchdog sends Telegram message to admin on bot restart
  - Result: admin knows about every incident

- [ ] **1.6** Structured JSON logging
  - Add JSON log format (separate `bot.json.log`)
  - Result: logs parseable by monitoring tools

---

## Phase 2 — Scaling reports (5-10 new types)

- [ ] **2.1** VBA macros for new reports
  - In Excel: create macros per report type following existing pattern
  - Result: each report generates via VBA

- [ ] **2.2** Register in report_config.py
  - Add entries to `REPORT_TYPES` with named_ranges, params, vba_macro
  - Result: Python auto-discovers new reports, Mini App shows them

- [ ] **2.3** Flexible parameters
  - Support month, quarter, date_range (not just year+week) in excel_service + Mini App
  - Result: different reports can have different parameter sets

- [ ] **2.4** Priority Queue
  - Task queue with priorities (manual > Mini App > scheduler), max size 50
  - Result: manual requests not blocked by scheduled jobs

- [ ] **2.5** Progress bar via VBA
  - VBA writes to `Report_Progress` named range (0-100), Python polls and updates Telegram message
  - Result: user sees real progress instead of "Step 2/3"

---

## Phase 3 — UX improvements (Mini App)

- [ ] **3.1** Enhanced greeting
  - Time-of-day greeting, user role badge, last generated report
  - Result: more personalized experience

- [ ] **3.2** Report history
  - Store last 10 generations per user (SQLite/JSON), show in Mini App
  - Result: user sees past reports, can repeat with one tap

- [ ] **3.3** WebSocket progress
  - `ws://reports.groo.de/ws/progress` — realtime generation status
  - Result: animated progress bar in Mini App

- [ ] **3.4** Light theme support
  - Support Telegram light theme (currently dark only)
  - Result: correct appearance for users with light theme

---

## Phase 4 — Advanced infrastructure (when >20 users)

- [ ] **4.1** Monitoring (Uptime Kuma)
  - Self-hosted Uptime Kuma, monitor `reports.groo.de/healthz`
  - Result: push notifications on downtime, uptime history

- [ ] **4.2** Excel backups
  - Daily automatic copy of `.xlsm` to OneDrive/SharePoint
  - Result: data loss protection

- [ ] **4.3** Multi-user rate limiting
  - IP-based + user-based rate limiting on web server
  - Result: protection as user count grows

- [ ] **4.4** VPS migration (optional)
  - Only if switching from Excel COM to Python generation (openpyxl + reportlab)
  - Result: independence from office PC, 99.9% uptime

---

## Known Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Excel COM hangs | HIGH | CRITICAL | Task 1.1 (subprocess isolation) |
| PC reboot/power off | MEDIUM | HIGH | Tasks 0.4 + 0.5 (UPS + autostart) |
| Quick Tunnel stops | HIGH | HIGH | Tasks 0.1-0.3 (Named Tunnel) |
| Excel file locked/corrupt | MEDIUM | HIGH | EXCEL_BOT_COPY + Task 4.2 (backups) |
| 10 reports = 10x wait time | HIGH (at scale) | MEDIUM | Tasks 1.2 + 2.4 (cache + queue) |
| API abuse | LOW | MEDIUM | Tasks 1.3 + 1.4 (size limit + CORS) |
| OneDrive sync conflicts | MEDIUM | HIGH | Move bot to local dir `C:\lkw_report_bot\` |
