# Offsite Backup With Backblaze B2

## Target Design

Use two backup layers:

1. Local daily dump in `storage/backups`.
2. Independent offsite copy in Backblaze B2 EU Central.

Recommended retention:

- Local: 30 days.
- Backblaze Object Lock default retention: 90 days.
- Backblaze Lifecycle Rule for `daily/`: remove backup objects after 365 days.

This keeps short-term restores fast while protecting recent backups from deletion or ransomware and still keeping one year of history offsite.

## One-Time Backblaze Setup

1. Create a Backblaze B2 account in the `EU Central` region.
2. Create a private bucket for planning backups, for example `groo-lkw-planning-backups`.
3. Enable `Object Lock` on the bucket.
4. Set default Object Lock retention to `COMPLIANCE`, 90 days.
5. Add a lifecycle rule for prefix `daily/` that deletes data after 365 days.
6. Create an application key restricted to this bucket.
7. Save the generated `keyID` and `applicationKey` once; Backblaze does not show the secret key again later.

## Local Configuration

Install `rclone` on the machine that runs the backup task.

Add to `.env`:

```dotenv
OFFSITE_BACKUP_ENABLED=true
B2_REMOTE_NAME=backblaze_b2
B2_BUCKET=groo-lkw-planning-backups
B2_PREFIX=daily
B2_KEY_ID=replace_me
B2_APPLICATION_KEY=replace_me
```

Do not commit `.env`.

## Runtime Flow

The existing scheduled task still runs only one command:

```powershell
.\scripts\backup_postgres.ps1
```

When `OFFSITE_BACKUP_ENABLED=true`, the script:

1. Creates the local PostgreSQL dump.
2. Applies local retention.
3. Uploads the new dump to Backblaze B2 via `scripts/upload_backups_to_b2.ps1`.

Manual upload test:

```powershell
.\scripts\upload_backups_to_b2.ps1
```

## Restore Policy

Use local backup first when available.

If the local VPS is lost:

1. Download the needed `.dump` file from Backblaze B2.
2. Restore it with the procedure in `BACKUP_AND_RESTORE.md`.
3. Record the restore test date in project documentation.

## Why This Is The Preferred Design

- The backup provider is independent from the Hetzner production VPS.
- The account can stay in the EU region.
- Object Lock protects recent backups from deletion before the retention date.
- The solution scales from today's small database to larger future backups without changing the application architecture.
