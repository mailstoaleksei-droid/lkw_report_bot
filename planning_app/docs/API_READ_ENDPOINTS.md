# API Read Endpoints

## Purpose

These endpoints expose the imported planning data to the future web UI. They require a valid login session cookie.

## Auth

Login:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "change_me"
}
```

The API stores the session in the configured cookie.

For local Docker over plain `http://localhost`, use:

```env
SESSION_COOKIE_SECURE=false
```

For HTTPS production, set it to `true`.

## LKW

```http
GET /api/lkw?activeOnly=true&limit=200
```

Optional filters:

- `q`
- `companyId`
- `status`
- `activeOnly`
- `limit`

## Drivers

```http
GET /api/drivers?activeOnly=true&limit=200
```

Optional filters:

- `q`
- `companyId`
- `status`
- `activeOnly`
- `limit`

## Planning Day

```http
GET /api/planning/day?date=2026-05-04
```

Returns:

- planning counters
- LKW-first assignment rows
- driver availability on the selected date
- unassigned orders
- problem status and reason fields

Verified on 2026-05-13:

- `/api/lkw?activeOnly=true&limit=5` returned 5 rows
- `/api/drivers?activeOnly=true&limit=5` returned 5 rows
- `/api/planning/day?date=2026-05-04` returned 54 planning rows and 1 problem order
