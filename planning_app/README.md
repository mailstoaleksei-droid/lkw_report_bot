# LKW Planning App

Internal multi-user planning application for daily and weekly LKW operations.

This app is intentionally separated from the existing Telegram Mini App and
reporting workflow. It uses its own application code, its own environment file,
and should use a separate PostgreSQL database or at least a separate PostgreSQL
schema in production.

## Scope

MVP:
- Email/password login with roles: Admin, Operator, Viewer. Manager is prepared.
- LKW master data.
- Driver master data.
- Driver vacation and sick availability imports from Excel.
- Orders-first planning.
- LKW-first planning.
- Tagesplanung with filters, counters, conflict checks, and holiday warning.
- Audit log.
- Excel import preview and validation.
- PDF and Excel exports.
- Daily backup scripts and deployment notes.

Not in MVP:
- Full chassis operations.
- Telegram notifications.
- Accounting system integration.

Future-ready nullable fields and tables are included for chassis, Telegram
accounts, and external order mappings.

## Recommended Production Layout

- Hosting: Hetzner Cloud Germany.
- DNS and SSL: Cloudflare.
- Reverse proxy: Caddy or Traefik on the VPS.
- Database: dedicated PostgreSQL database `lkw_planning` or schema `planning`.
- Existing reporting database must remain isolated from this planning app.

## Local Setup

1. Copy `.env.example` to `.env`.
2. Set local development values only. Do not copy production secrets.
3. Start services:

```powershell
docker compose up --build
```

4. Run Prisma migrations after dependencies are installed:

```powershell
npm install
npm run db:migrate
```

## Structure

```text
planning_app/
  apps/
    api/                 Fastify API, auth, imports, exports
    web/                 Next.js frontend
  prisma/
    schema.prisma        Planning database schema
  scripts/
    backup_postgres.ps1  Windows backup helper
    install_daily_backup_task.ps1
  docs/
    TECHNICAL_AUDIT.md   Existing system audit
    ARCHITECTURE.md      Target architecture
    BACKUP_AND_RESTORE.md
    DEPLOYMENT_HETZNER_CLOUDFLARE.md
    OFFSITE_BACKUP_BACKBLAZE_B2.md
    ROADMAP.md           MVP and phase 2 plan
  docker-compose.yml
  .env.example
```

## Backups

Create a manual PostgreSQL backup:

```powershell
.\scripts\backup_postgres.ps1
```

Install the daily Windows backup task:

```powershell
.\scripts\install_daily_backup_task.ps1
```

Backups are stored in `storage/backups` and retention is controlled by
`BACKUP_RETENTION_DAYS` in `.env`. Restore test steps are documented in
`docs/BACKUP_AND_RESTORE.md`.

For production, use the preferred two-layer design:

- local daily dumps;
- independent Backblaze B2 EU Central offsite copies with Object Lock.

The one-time setup steps are documented in `docs/OFFSITE_BACKUP_BACKBLAZE_B2.md`.

## Safety Rules

- Do not import production secrets into this folder.
- Do not write to existing reporting tables from this app.
- Do not reuse the existing `public` reporting tables for planning writes.
- Import Excel data through preview, validation, and transaction steps.
- Use soft deletes for business records.
- Record important business changes in `audit_log`.
