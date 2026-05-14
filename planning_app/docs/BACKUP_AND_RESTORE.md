# Backup And Restore

## Daily Backup

The planning database runs in Docker as `lkw_planning_postgres`.

Create a manual backup:

```powershell
.\scripts\backup_postgres.ps1
```

Install the Windows daily backup task:

```powershell
.\scripts\install_daily_backup_task.ps1
```

Default schedule: every day at `02:30`.

Backups are written to:

```text
planning_app/storage/backups/lkw_planning_YYYYMMDD_HHMMSS.dump
```

Retention is controlled by `BACKUP_RETENTION_DAYS` in `.env`.

## Restore Test

Run this once per month against a temporary restore database. Do not restore into production until a backup has been verified.

1. Start Docker services:

```powershell
docker compose up -d postgres
```

2. Pick the newest backup file from `storage/backups`.

3. Create a temporary database:

```powershell
docker compose exec -T postgres sh -lc "createdb --username=`"`$POSTGRES_USER`" lkw_planning_restore_test"
```

4. Restore the backup into the temporary database:

```powershell
docker compose exec -T postgres sh -lc "pg_restore --clean --if-exists --no-owner --username=`"`$POSTGRES_USER`" --dbname=lkw_planning_restore_test /backups/lkw_planning_YYYYMMDD_HHMMSS.dump"
```

5. Check that core tables exist:

```powershell
docker compose exec -T postgres sh -lc "psql --username=`"`$POSTGRES_USER`" --dbname=lkw_planning_restore_test --command='select count(*) from planning.orders;'"
```

6. Drop the temporary database:

```powershell
docker compose exec -T postgres sh -lc "dropdb --if-exists --username=`"`$POSTGRES_USER`" lkw_planning_restore_test"
```

## Production Note

For Hetzner production, copy backups to storage outside the main VPS, for example Hetzner Storage Box, S3-compatible storage, or another secured backup host.
