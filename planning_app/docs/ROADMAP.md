# Development Roadmap

## MVP Breakdown

1. Repository hardening
   - Keep `planning_app/` isolated from existing reporting.
   - Add CI only after package installation and first tests.

2. Database
   - Review `prisma/schema.prisma`.
   - Create initial migration.
   - Seed Admin user and app settings.

3. Auth and users
   - Email/password login.
   - Bcrypt password hashing.
   - JWT/session cookie.
   - Admin-created users.
   - Role guards for Admin, Operator, Viewer, Manager.

4. Master data
   - LKW CRUD.
   - Driver CRUD.
   - Status normalization.
   - Soft delete.

5. Excel import
   - Upload/select file.
   - Preview.
   - Validation report.
   - Duplicate detection.
   - Safe transaction execution.
   - Import rollback strategy.

6. Availability
   - Import Urlaub/Krank grid.
   - Check planning date against driver availability.

7. Orders and assignments
   - Orders-first mode.
   - LKW-first mode.
   - Conflict detection.
   - Problem status without blocking save.

8. Tagesplanung
   - Date/week/month filters.
   - Company, LKW, driver, status, Runde filters.
   - Counters.
   - Germany/Hamburg holiday warning.
   - Excel-style fast table.

9. Dashboard
   - Orders today.
   - Assigned LKW.
   - Free LKW.
   - Open orders.
   - LKW usage percent.
   - Weekly/monthly statistics.
   - Conflicts/problems.

10. Audit log
   - Entity audit events.
   - Order card audit timeline.
   - Separate Audit Log page.

11. Export
   - PDF Tagesplan.
   - Excel Tagesplan.
   - PDF Wochenplan.
   - Excel Wochenplan.
   - Export logs.

12. Operations
   - Docker Compose.
   - Healthchecks.
   - Daily backup script.
   - Restore test procedure.
   - Deployment README.

## Phase 2

- Full chassis management.
- Telegram bot integration for driver plan lookup.
- Accounting/order system integration.
- `external_order_id` synchronization.
- Automatic accounting order number import.
- Advanced mobile view.
- Automatic LKW suggestions.
- Advanced KPI dashboard.
- Planning change notifications.
- Optional read-only connector to existing reporting app.

