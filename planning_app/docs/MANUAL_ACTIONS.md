# Manual Actions

This file lists actions that cannot be completed safely without an infrastructure
decision or local machine setup.

## 1. Choose Database Isolation

Recommended production option:
- Create a separate PostgreSQL database: `lkw_planning`.
- Create a separate user: `planning_user`.
- Do not grant this user write access to the existing reporting tables.

Acceptable temporary option:
- Use the existing PostgreSQL server with a separate schema: `planning`.
- Keep the reporting app in `public` and `repair`.
- Grant the planning app only the permissions it needs in schema `planning`.

## 2. Create Local `.env`

In `planning_app/`, copy:

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

## 3. Install Docker

Docker is not currently available from the shell on this machine:

```powershell
docker --version
```

returned:

```text
docker is not recognized
```

Install Docker Desktop or use a Hetzner VPS with Docker Engine before testing
`docker compose up --build`.

## 4. Confirm Daily Tagesplan Source

Confirm where the screenshot table with these columns is stored:
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

Needed answer:
- workbook path
- sheet name
- first header row
- date represented by that sheet/table

## 5. Confirm LKW Aliases

The daily plan uses short `Wagen` values such as:
- `2206`
- `2234`
- `411`
- `4235`

Confirm mapping rules:
- Is `2206` always `GR-OO2206`?
- What are `411` and `4235`?
- Are aliases unique over time?

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

