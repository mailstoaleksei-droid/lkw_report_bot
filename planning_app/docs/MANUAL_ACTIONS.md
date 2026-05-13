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

## 3. Docker Desktop

Local status:
- Docker Desktop 4.73.0 is installed.
- Docker CLI is available by direct path:

```powershell
& 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' --version
```

Current verified version:
- Docker CLI: `29.4.3`
- Docker Compose plugin: `5.1.3`

Installation notes:
- The first install failed because `C:\ProgramData\DockerDesktop` was owned by a normal user.
- The folder owner was changed to `Administrators`.
- The second install succeeded.
- The installer enabled `VirtualMachinePlatform`, `Microsoft-Windows-Subsystem-Linux`, and `Microsoft-Hyper-V`.

Manual action still needed:
1. Restart Windows, or at minimum log out and log in again.
2. Start Docker Desktop.
3. Verify in a normal PowerShell:

```powershell
docker --version
docker compose version
docker info
```

Reason:
- The interactive user `NBGROO21\Aleksei Samosvat` is already in local group `docker-users`.
- The current Codex runner is `nbgroo21\codexsandboxoffline`, so it cannot access the Docker daemon pipe until the session/user token is refreshed.

After that, test from `planning_app/`:

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
