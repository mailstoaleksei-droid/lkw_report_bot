-- LKW Report Bot
-- Initial PostgreSQL schema for SQL-first architecture.
-- Target: Neon PostgreSQL (production branch)

BEGIN;

CREATE TABLE IF NOT EXISTS companies (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trucks (
    id BIGSERIAL PRIMARY KEY,
    external_id TEXT NOT NULL UNIQUE,
    plate_number TEXT,
    truck_type TEXT,
    company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
    status TEXT,
    status_since DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    source_row_hash TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drivers (
    id BIGSERIAL PRIMARY KEY,
    external_id TEXT UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    source_row_hash TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS allowed_users (
    telegram_user_id BIGINT PRIMARY KEY,
    role_name TEXT NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    comment_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS etl_log (
    id BIGSERIAL PRIMARY KEY,
    source_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    rows_read INTEGER NOT NULL DEFAULT 0,
    rows_inserted INTEGER NOT NULL DEFAULT 0,
    rows_updated INTEGER NOT NULL DEFAULT 0,
    rows_deleted INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    details JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE TABLE IF NOT EXISTS schedules (
    id BIGSERIAL PRIMARY KEY,
    etl_log_id BIGINT REFERENCES etl_log(id) ON DELETE SET NULL,
    iso_year SMALLINT NOT NULL CHECK (iso_year BETWEEN 2020 AND 2100),
    iso_week SMALLINT NOT NULL CHECK (iso_week BETWEEN 1 AND 53),
    work_date DATE NOT NULL,
    company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
    truck_id BIGINT REFERENCES trucks(id) ON DELETE SET NULL,
    driver_id BIGINT REFERENCES drivers(id) ON DELETE SET NULL,
    shift_code TEXT,
    assignment_type TEXT,
    minutes_worked INTEGER,
    distance_km NUMERIC(12, 2),
    revenue_eur NUMERIC(14, 2),
    fuel_liters NUMERIC(12, 2),
    source_sheet TEXT,
    source_row_no INTEGER,
    source_row_hash TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    chat_id BIGINT NOT NULL,
    report_type TEXT NOT NULL,
    iso_year SMALLINT CHECK (iso_year BETWEEN 2020 AND 2100),
    iso_week SMALLINT CHECK (iso_week BETWEEN 1 AND 53),
    params JSONB NOT NULL DEFAULT '{}'::JSONB,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'success', 'failed')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    output_key TEXT,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS report_einnahmen_monthly (
    month_index SMALLINT PRIMARY KEY CHECK (month_index BETWEEN 1 AND 12),
    month_name TEXT NOT NULL,
    nahverkehr NUMERIC(14, 2) NOT NULL DEFAULT 0,
    logistics NUMERIC(14, 2) NOT NULL DEFAULT 0,
    gesamt NUMERIC(14, 2) NOT NULL DEFAULT 0,
    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_bonus_dynamik_monthly (
    report_year SMALLINT NOT NULL CHECK (report_year BETWEEN 2020 AND 2100),
    report_month SMALLINT NOT NULL CHECK (report_month BETWEEN 1 AND 12),
    month_start DATE NOT NULL,
    fahrer_id TEXT NOT NULL,
    fahrer_name TEXT NOT NULL,
    days INTEGER NOT NULL DEFAULT 0,
    km NUMERIC(14, 2) NOT NULL DEFAULT 0,
    pct_km NUMERIC(8, 2) NOT NULL DEFAULT 0,
    ct INTEGER NOT NULL DEFAULT 0,
    pct_ct NUMERIC(8, 2) NOT NULL DEFAULT 0,
    bonus NUMERIC(14, 2) NOT NULL DEFAULT 0,
    penalty NUMERIC(14, 2) NOT NULL DEFAULT 0,
    final NUMERIC(14, 2) NOT NULL DEFAULT 0,
    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (report_year, report_month, fahrer_id)
);

CREATE INDEX IF NOT EXISTS idx_trucks_company_id ON trucks(company_id);
CREATE INDEX IF NOT EXISTS idx_drivers_company_id ON drivers(company_id);

CREATE INDEX IF NOT EXISTS idx_schedules_iso_year_week ON schedules(iso_year, iso_week);
CREATE INDEX IF NOT EXISTS idx_schedules_work_date ON schedules(work_date);
CREATE INDEX IF NOT EXISTS idx_schedules_company_id ON schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_schedules_driver_work_date ON schedules(driver_id, work_date);
CREATE INDEX IF NOT EXISTS idx_schedules_truck_work_date ON schedules(truck_id, work_date);

CREATE INDEX IF NOT EXISTS idx_etl_log_status_started_at ON etl_log(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_log_user_requested_at ON reports_log(user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_log_type_requested_at ON reports_log(report_type, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_bonus_dynamik_lookup ON report_bonus_dynamik_monthly(report_year, report_month, fahrer_name);

COMMIT;
