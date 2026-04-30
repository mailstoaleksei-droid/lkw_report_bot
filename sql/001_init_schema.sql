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

CREATE TABLE IF NOT EXISTS report_einnahmen_firm_monthly (
    row_index SMALLINT PRIMARY KEY CHECK (row_index BETWEEN 1 AND 20),
    firm_name TEXT NOT NULL,
    january NUMERIC(14, 2) NOT NULL DEFAULT 0,
    february NUMERIC(14, 2) NOT NULL DEFAULT 0,
    march NUMERIC(14, 2) NOT NULL DEFAULT 0,
    april NUMERIC(14, 2) NOT NULL DEFAULT 0,
    may NUMERIC(14, 2) NOT NULL DEFAULT 0,
    june NUMERIC(14, 2) NOT NULL DEFAULT 0,
    july NUMERIC(14, 2) NOT NULL DEFAULT 0,
    august NUMERIC(14, 2) NOT NULL DEFAULT 0,
    september NUMERIC(14, 2) NOT NULL DEFAULT 0,
    october NUMERIC(14, 2) NOT NULL DEFAULT 0,
    november NUMERIC(14, 2) NOT NULL DEFAULT 0,
    december NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total NUMERIC(14, 2) NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS report_diesel_monthly (
    report_year SMALLINT NOT NULL CHECK (report_year BETWEEN 2020 AND 2100),
    month_index SMALLINT NOT NULL CHECK (month_index BETWEEN 1 AND 12),
    month_name TEXT NOT NULL,
    liter_staack NUMERIC(14, 2) NOT NULL DEFAULT 0,
    liter_shell NUMERIC(14, 2) NOT NULL DEFAULT 0,
    liter_dkv NUMERIC(14, 2) NOT NULL DEFAULT 0,
    liter_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    euro_staack NUMERIC(14, 2) NOT NULL DEFAULT 0,
    euro_shell NUMERIC(14, 2) NOT NULL DEFAULT 0,
    euro_dkv NUMERIC(14, 2) NOT NULL DEFAULT 0,
    euro_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    euro_per_liter_staack NUMERIC(10, 4) NOT NULL DEFAULT 0,
    euro_per_liter_shell NUMERIC(10, 4) NOT NULL DEFAULT 0,
    euro_per_liter_dkv NUMERIC(10, 4) NOT NULL DEFAULT 0,
    euro_per_liter_avg NUMERIC(10, 4) NOT NULL DEFAULT 0,
    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (report_year, month_index)
);

CREATE TABLE IF NOT EXISTS report_yf_fahrer_monthly (
    month_index SMALLINT NOT NULL CHECK (month_index BETWEEN 1 AND 12),
    fahrer_name TEXT NOT NULL,
    distanz_km NUMERIC(14, 2) NOT NULL DEFAULT 0,
    aktivitaet_total_minutes INTEGER NOT NULL DEFAULT 0,
    fahrzeit_total_minutes INTEGER NOT NULL DEFAULT 0,
    inaktivitaet_total_minutes INTEGER NOT NULL DEFAULT 0,
    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (month_index, fahrer_name)
);

CREATE TABLE IF NOT EXISTS report_yf_lkw_daily (
    report_year SMALLINT NOT NULL CHECK (report_year BETWEEN 2020 AND 2100),
    month_index SMALLINT NOT NULL CHECK (month_index BETWEEN 1 AND 12),
    month_name TEXT NOT NULL,
    iso_week SMALLINT NOT NULL CHECK (iso_week BETWEEN 1 AND 53),
    lkw_nummer TEXT NOT NULL,
    report_date DATE NOT NULL,
    source_row INTEGER NOT NULL DEFAULT 0,
    dayweek TEXT,
    strecke_km NUMERIC(14, 2) NOT NULL DEFAULT 0,
    km_start NUMERIC(14, 2) NOT NULL DEFAULT 0,
    km_end NUMERIC(14, 2) NOT NULL DEFAULT 0,
    drivers_final TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (report_year, iso_week, lkw_nummer, report_date, source_row)
);

CREATE TABLE IF NOT EXISTS report_sim_contado (
    lkw_number TEXT PRIMARY KEY,
    sim_name TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL DEFAULT '',
    source_row INTEGER NOT NULL DEFAULT 0,
    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_sim_vodafone (
    lkw_number TEXT PRIMARY KEY,
    pin TEXT NOT NULL DEFAULT '',
    puk TEXT NOT NULL DEFAULT '',
    source_row INTEGER NOT NULL DEFAULT 0,
    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_repair_records (
    source_row INTEGER PRIMARY KEY,
    report_year SMALLINT NOT NULL CHECK (report_year BETWEEN 2020 AND 2100),
    report_month SMALLINT NOT NULL CHECK (report_month BETWEEN 1 AND 12),
    iso_week SMALLINT NOT NULL CHECK (iso_week BETWEEN 1 AND 53),
    invoice_date DATE,
    truck_number TEXT NOT NULL,
    original_truck_number TEXT,
    repair_name TEXT,
    total_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
    invoice TEXT,
    seller TEXT,
    buyer TEXT,
    kategorie TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
CREATE INDEX IF NOT EXISTS idx_report_yf_fahrer_lookup ON report_yf_fahrer_monthly(month_index, fahrer_name);
CREATE INDEX IF NOT EXISTS idx_report_yf_lkw_lookup ON report_yf_lkw_daily(report_year, iso_week, lkw_nummer, report_date, source_row);
CREATE INDEX IF NOT EXISTS idx_report_sim_contado_lkw ON report_sim_contado(lkw_number);
CREATE INDEX IF NOT EXISTS idx_report_sim_vodafone_lkw ON report_sim_vodafone(lkw_number);
CREATE INDEX IF NOT EXISTS idx_report_repair_truck_date ON report_repair_records(truck_number, invoice_date, report_year, report_month, iso_week);
CREATE INDEX IF NOT EXISTS idx_report_repair_total ON report_repair_records(total_price DESC);

COMMIT;
