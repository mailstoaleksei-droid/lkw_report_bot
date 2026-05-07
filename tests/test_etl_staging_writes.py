from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def test_xlsm_report_import_writes_to_staging_before_swap():
    source = _read("etl_xlsm_to_postgres.py")

    assert "_ensure_report_staging_tables(cur)" in source
    assert "INSERT INTO tmp_report_fahrer_weekly_status" in source
    assert "INSERT INTO tmp_report_lkw_fuel_transactions" in source
    assert "INSERT INTO tmp_report_yf_lkw_daily" in source
    assert "rows_deleted += _swap_report_staging_tables(cur)" in source
    assert "DELETE FROM report_fahrer_weekly_status" not in source
    assert "DELETE FROM report_lkw_fuel_transactions" not in source


def test_xlsb_plan_import_writes_to_staging_before_swap():
    source = _read("etl_xlsb_to_postgres.py")

    assert "CREATE TEMP TABLE tmp_schedules" in source
    assert "INSERT INTO tmp_schedules" in source
    assert "DELETE FROM schedules WHERE source_sheet = %s" in source
    assert "FROM tmp_schedules" in source


def test_sim_import_writes_to_staging_before_swap():
    source = _read("etl_sim_cards_to_postgres.py")

    assert "CREATE TEMP TABLE tmp_report_sim_contado" in source
    assert "CREATE TEMP TABLE tmp_report_sim_vodafone" in source
    assert "INSERT INTO tmp_report_sim_contado" in source
    assert "INSERT INTO tmp_report_sim_vodafone" in source
    assert "INSERT INTO report_sim_contado SELECT * FROM tmp_report_sim_contado" in source
    assert "INSERT INTO report_sim_vodafone SELECT * FROM tmp_report_sim_vodafone" in source
