# Planning App Architecture

## Decision

Use a separate application boundary:
- Frontend: Next.js, React, TypeScript.
- API: Node.js, Fastify, TypeScript.
- Database: PostgreSQL.
- ORM: Prisma.
- Deployment: Docker Compose.
- Production hosting: Hetzner Cloud Germany.
- DNS and SSL: Cloudflare.

The existing Telegram Mini App and reporting workflow remain independent.

## Runtime Components

```text
Cloudflare DNS/SSL
  -> Hetzner VPS
    -> reverse proxy
      -> web container: Next.js
      -> api container: Fastify
      -> postgres container or external managed PostgreSQL
```

## Database Isolation

Preferred:
- Dedicated database: `lkw_planning`
- Dedicated DB user: `planning_user`

Acceptable:
- Dedicated schema: `planning`
- No write permissions to existing reporting schema/tables.

## API Modules

MVP modules:
- `auth`: login, password hashing, role checks.
- `users`: Admin user management.
- `lkw`: LKW master data.
- `drivers`: driver master data.
- `availability`: vacation/sick data.
- `orders`: order CRUD and status changes.
- `assignments`: LKW/driver/chassis assignments and conflict checks.
- `planning`: day/week/month planning views.
- `imports`: Excel upload, preview, validation, execute.
- `exports`: PDF and Excel exports.
- `audit`: audit log pages and entity event history.
- `holidays`: Germany/Hamburg holiday warnings.
- `settings`: app settings.

## UI Pages

MVP pages:
- Login.
- Dashboard.
- Tagesplanung.
- Orders-first planning.
- LKW-first planning.
- LKW management.
- Driver management.
- Vacation/sick import.
- Import page.
- Export actions.
- Audit Log.
- User management.
- Settings.

## Import Strategy

All imports must use this flow:
1. Upload or select Excel file.
2. Copy source to import staging.
3. Parse into preview payload.
4. Normalize statuses.
5. Detect duplicates and conflicts.
6. Show validation report.
7. Execute in one database transaction.
8. Record `imports`, `import_errors`, and `audit_log`.

Default import scope:
- Master data.
- Last month of historical planning.
- Future planning dates.

Do not import all old history by default.

## Status Normalization

Normalize to internal enum values:
- `Aktiv` -> `ACTIVE`
- `Inaktiv` -> `INACTIVE`
- `Verkauft` -> `SOLD`
- `Ruckgabe`, `Rueckgabe`, `Rückgabe` -> `RETURNED`
- `Werkstatt` -> `WORKSHOP`
- `Reserve` -> `RESERVE`
- `Fahrer entlassen` -> `DISMISSED`
- `Urlaub` -> `VACATION`
- `Krank` -> `SICK`
- `Offen` -> `OPEN`
- `Geplant` -> `PLANNED`
- `Problem` -> `PROBLEM`
- `Fertig` -> `DONE`
- `Storniert` -> `CANCELLED`

## Conflict Rules

Conflicts should mark records as `PROBLEM` in MVP and should not block saving:
- Sold/returned/inactive LKW selected for planning date.
- Workshop LKW selected without explicit operator acceptance.
- Same LKW assigned to more than one order in same date and Runde.
- Dismissed driver selected after dismissal date.
- Driver selected while vacation/sick.
- Missing required order fields.

## Future Telegram Integration

Prepare data model now, but do not implement MVP notifications.

Future search options:
- Driver surname.
- LKW number.
- Today.
- Current week.
- Next week.

The future integration should read planning data through API endpoints, not by querying app tables directly from the old bot.

