# Database Setup

## Decision

The planning app uses a separate PostgreSQL database:

- Application database: `lkw_planning`
- Shadow database: `lkw_planning_shadow`
- Application schema inside the database: `planning`

This keeps the existing Telegram/reporting database isolated from the new planning app.
The runtime Prisma schema does not require a shadow database; `lkw_planning_shadow`
is kept for manual development workflows when Prisma needs a separate shadow DB.

## Local Status

On this machine, both databases have been created in the existing PostgreSQL cluster.

The first schema migration is stored here:

```text
prisma/migrations/202605121_initial_planning_schema/migration.sql
```

The SQL was applied manually because Prisma schema engine failed against Neon TLS on this Windows machine. Runtime database access now uses Prisma's JS PostgreSQL adapter (`@prisma/adapter-pg`), which works for the API and seed script.

## Admin Seed

The first Admin user has been seeded:

```text
a.samosvat@groo.de
```

The generated local password is stored only in the local gitignored file:

```text
planning_app/.env
```

Do not commit this file.

## Rebuild Commands

```powershell
npm run db:generate
npm run db:seed
npm run build --workspace @lkw-planning/api
npm run build --workspace @lkw-planning/web
```

## Production Notes

For production on Hetzner or another server:

1. Create a dedicated database user for `lkw_planning`.
2. Do not grant that user write access to the reporting app database.
3. Set all secrets via environment variables.
4. Use `sslmode=verify-full` when the PostgreSQL provider supports it.
5. Run the migration SQL or Prisma migration from a Linux server where Prisma schema engine can connect normally.
