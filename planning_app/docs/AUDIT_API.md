# Audit API

## Purpose

The audit API exposes recorded business actions for order and assignment history.

The endpoint requires an authenticated user with at least `VIEWER` role.

## Endpoint

```http
GET /api/audit-log
```

Optional filters:

- `entityType`
- `entityId`
- `orderId`
- `assignmentId`
- `userId`
- `eventType`
- `limit`

Example:

```http
GET /api/audit-log?orderId=<uuid>&limit=50
```

## Current Audit Sources

Audit rows are currently created by:

- reporting master data import
- reporting schedule import
- reporting driver availability import
- order create/update/cancel
- assignment create/update
- driver assignment

## Verification

Verified on 2026-05-13:

- `npm run build --workspace @lkw-planning/api` passed

Docker runtime verification is pending because Docker Desktop was not running during the final check.
