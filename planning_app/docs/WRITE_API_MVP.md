# Write API MVP

## Purpose

The planning app now has the first write API for creating orders and assigning LKW/drivers.

These endpoints require an authenticated user with at least `OPERATOR` role.

## Orders

Create order:

```http
POST /api/orders
Content-Type: application/json

{
  "planningDate": "2026-05-04",
  "runde": 1,
  "description": "Example order"
}
```

Update order:

```http
PATCH /api/orders/:id
Content-Type: application/json

{
  "description": "Updated order",
  "status": "OPEN"
}
```

Cancel order:

```http
POST /api/orders/:id/cancel
```

Cancelling an order also marks its active assignments as `CANCELLED`.

## Assignments

Create or update the active assignment for an order:

```http
POST /api/assignments/upsert
Content-Type: application/json

{
  "orderId": "uuid",
  "lkwId": "uuid",
  "driverId": "uuid",
  "chassisId": null
}
```

## Problem Checks

The assignment endpoint marks the assignment and linked order as `PROBLEM` when:

- LKW is inactive, sold, or returned
- LKW was sold or returned on or before the planning date
- same LKW is already assigned in the same date and Runde
- driver is inactive or dismissed
- driver was dismissed on or before the planning date
- driver has `VACATION` or `SICK` availability on the planning date

In MVP, these checks do not block saving.

## Audit Log

The write API creates audit records for:

- order created
- order updated
- order cancelled
- assignment created or updated
- driver assigned

## Verification

Verified on 2026-05-13:

- `npm run build --workspace @lkw-planning/api` passed

Docker runtime verification is pending because Docker Desktop was not running during the final check.
