# Manual Actions

This file lists actions that cannot be completed safely without an infrastructure
decision or local machine setup.

## 1. Database Isolation

Confirmed option:
- Use a separate PostgreSQL database: `lkw_planning`.
- Use `lkw_planning_shadow` for Prisma shadow database work.
- Keep the existing reporting database untouched.

Local status:
- `lkw_planning` was created in the existing PostgreSQL cluster.
- `lkw_planning_shadow` was created in the existing PostgreSQL cluster.
- The planning app uses schema `planning` inside the separate DB.
- The initial migration SQL was applied manually because Prisma schema engine failed on this Windows/Neon TLS combination.

## 2. Create Local `.env`

For a clean machine, in `planning_app/`, copy:

```powershell
Copy-Item .env.example .env
```

Then set:
- `DATABASE_URL`
- `SHADOW_DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_DISPLAY_NAME`

Do not copy production secrets from the reporting app.

Local status:
- `.env` exists on this machine and is gitignored.
- First Admin seed email is `a.samosvat@groo.de`.
- The generated local Admin password is stored only in `planning_app/.env`.

## 3. Install Docker

Docker is not currently available from the shell on this machine:

```powershell
docker --version
```

returned:

```text
docker is not recognized
```

Automatic install attempt:
- `winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements`
- The installer downloaded successfully.
- The install failed at the Windows admin/UAC step.

Manual action:
1. Open PowerShell as Administrator.
2. Run:

```powershell
winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
```

3. Restart Windows if Docker asks for it.
4. After restart, verify:

```powershell
docker --version
docker compose version
```

Then test from `planning_app/`:

```powershell
docker compose up --build
```

## 4. Confirm Daily Tagesplan Source

Confirmed source:

```text
C:\Users\Aleksei Samosvat\Groo GmbH\Intranet - Groo GmbH - Dokumente\Groo Cargo Logistic\GC_Dispo\Dispo 2026 Wochenplanung_.xlsm
```

Confirmed columns:
- `Nr`
- `Wagen`
- status/check icon column
- `PLZ`
- `Runde_1`
- `Runde_2`
- `Runde_3`
- `Land`
- `Info`
- `LKW gebraucht`

Each date worksheet is one planning date. Header row is row 1.

## 5. Confirm LKW Aliases

The daily plan uses short `Wagen` values such as:
- `2206`
- `2234`
- `411`
- `4235`

Confirm mapping rules:
- `2206` is mapped as `GR-OO2206`.
- `411` is mapped as `KO-HH411`.
- `4295` is mapped as `WI-QY4295`.
- Are aliases unique over time?

Still needed:
- Full alias generation/import for all short numbers and non-standard numbers like `GR-OO2459Nacht`.

## 6. Confirm Status Icons

Confirm meaning of the green/red icons in the Tagesplan sheet:
- green icon
- red icon
- whether a red icon should become `Problem`

## 7. Confirm Runde Count

MVP UI can show `Runde_1` to `Runde_3` immediately.

Confirm whether business can require:
- `Runde_4`
- more than 4 rounds
- custom Runde labels
