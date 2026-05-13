# Web UI MVP

## Purpose

The first web UI connects to the planning API and shows imported planning data after login.

## Current Pages

The current MVP uses the root page:

```http
http://localhost:3000
```

Implemented:

- login form
- logout
- dashboard counters for selected date
- date selector
- LKW-first Tagesplanung table
- active LKW preview list
- active driver preview list
- problem row highlighting
- driver availability indicator per planning row

## API Dependencies

The UI reads:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/lkw`
- `GET /api/drivers`
- `GET /api/planning/day?date=YYYY-MM-DD`

## Local Use

1. Start Docker Desktop.
2. Run Docker Compose from `planning_app`.
3. Open `http://localhost:3000`.
4. Login with the seeded Admin user.
5. Select a planning date, for example `2026-05-04`.

## Verification

Verified on 2026-05-13:

- `npm run build --workspace @lkw-planning/web` passed
- `npm run build --workspace @lkw-planning/api` passed

Docker browser verification is pending because Docker Desktop was not running during the final check.
