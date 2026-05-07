"""
ETL: LKW_Fahrer_Plan.xlsb -> PostgreSQL (Neon)

Phase 1.4 MVP:
- reads weekly assignments from sheet "Fahrer-Arbeitsplan"
- maps truck IDs via trucks.external_id
- best-effort maps driver names via drivers.full_name
- replaces imported rows for this source in schedules
- writes run metadata to etl_log
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import re
import shutil
import tempfile
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from pyxlsb import open_workbook


PLAN_SHEET = "Fahrer-Arbeitsplan"
STATUS_TOKENS = {
    "0",
    "r",
    "o.f.",
    "of",
    "werkstatt",
    "ersatzwagen",
    "ohne fahrer",
    "ohne lkw",
    "urlaub",
    "u",
    "k",
    "verkauft",
    "miete",
    "andreas groo",
}
TRAILING_DRIVER_MARKERS = {"u", "k", "r", "of", "o.f.", "urlaub"}


def _norm(value: object) -> str:
    s = str(value or "").strip().lower()
    for a, b in (
        ("ä", "a"),
        ("ö", "o"),
        ("ü", "u"),
        ("ß", "ss"),
        ("ё", "е"),
        ("й", "и"),
        ("\n", " "),
        ("↔", " "),
    ):
        s = s.replace(a, b)
    s = re.sub(r"[\(\)\[\],;:+]", " ", s)
    return " ".join(s.split())


def _clean(value: object) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def _to_int(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int,)):
        return int(value)
    if isinstance(value, float):
        return int(value)
    s = str(value).strip()
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def _iso_monday(iso_year: int, iso_week: int) -> date:
    return date.fromisocalendar(iso_year, iso_week, 1)


def _is_status_cell(value: str) -> bool:
    norm_value = _norm(value)
    if norm_value in STATUS_TOKENS:
        return True

    parts = [p.strip() for p in re.split(r"/|\\|&", str(value)) if str(p).strip()]
    if not parts:
        return False
    for part in parts:
        p = _norm(part)
        if not p:
            continue
        if p in STATUS_TOKENS:
            continue
        if _is_numeric_like(p):
            continue
        return False
    return True


def _is_numeric_like(value: str) -> bool:
    return bool(re.fullmatch(r"\d+(?:\.0+)?", value.strip()))


def _clean_driver_fragment(value: object) -> str:
    tokens = _norm(value).split()
    while tokens and tokens[-1] in TRAILING_DRIVER_MARKERS:
        tokens.pop()
    return " ".join(tokens).strip()


def _driver_candidates(assignment: str) -> list[str]:
    candidates: list[str] = []
    for part in re.split(r"/|\\|&", assignment):
        cleaned = _clean_driver_fragment(part)
        if not cleaned:
            continue
        if cleaned in STATUS_TOKENS or _is_numeric_like(cleaned):
            continue
        if cleaned not in candidates:
            candidates.append(cleaned)

    fallback = _clean_driver_fragment(assignment)
    if fallback and fallback not in STATUS_TOKENS and not _is_numeric_like(fallback) and fallback not in candidates:
        candidates.append(fallback)
    return candidates


def _resolve_driver_id(assignment: str, driver_map: dict[str, int]) -> int | None:
    for candidate in _driver_candidates(assignment):
        matched = driver_map.get(candidate)
        if matched is not None:
            return matched
    return None


@dataclass
class PlanRecord:
    iso_year: int
    iso_week: int
    work_date: date
    truck_external_id: str
    truck_id: int | None
    company_id: int | None
    driver_id: int | None
    assignment_value: str
    assignment_type: str
    source_row_no: int
    source_row_hash: str
    raw_payload: dict[str, object]


def _discover_xlsb_path(xlsm_path: Path) -> Path:
    # 1) sibling of EXCEL_FILE_PATH
    sibling = xlsm_path.with_name("LKW_Fahrer_Plan.xlsb")
    if sibling.exists():
        return sibling

    # 2) from temp fallback
    temp_dir = Path(tempfile.gettempdir())
    candidates = sorted(
        glob.glob(str(temp_dir / "LKW_Fahrer_Plan*.xlsb")),
        key=lambda p: Path(p).stat().st_mtime,
        reverse=True,
    )
    if candidates:
        return Path(candidates[0])

    raise FileNotFoundError("Could not locate LKW_Fahrer_Plan.xlsb (sibling or %TEMP%).")


def _prepare_readable_copy(source_path: Path) -> tuple[Path, bool]:
    if not source_path.exists():
        raise FileNotFoundError(f"XLSB source file not found: {source_path}")

    run_copy = Path(tempfile.gettempdir()) / f"LKW_Fahrer_Plan_ETL_{int(time.time())}.xlsb"
    try:
        shutil.copy2(source_path, run_copy)
        return run_copy, True
    except Exception:
        return source_path, False


def _fetch_lookup_maps(cur):
    cur.execute("SELECT id, external_id, company_id FROM trucks")
    truck_map = {}
    for tid, external_id, company_id in cur.fetchall():
        if external_id:
            truck_map[str(external_id).strip()] = (int(tid), int(company_id) if company_id else None)

    cur.execute("SELECT id, full_name FROM drivers")
    driver_map = {}
    for did, full_name in cur.fetchall():
        n = _norm(full_name)
        if n and n not in driver_map:
            driver_map[n] = int(did)
    return truck_map, driver_map


def _extract_records(xlsb_path: Path, truck_map: dict[str, tuple[int, int | None]], driver_map: dict[str, int]) -> list[PlanRecord]:
    records: list[PlanRecord] = []

    with open_workbook(str(xlsb_path)) as wb:
        if PLAN_SHEET not in wb.sheets:
            raise RuntimeError(f"Sheet '{PLAN_SHEET}' not found in {xlsb_path.name}")

        with wb.get_sheet(PLAN_SHEET) as ws:
            rows = []
            for row in ws.rows():
                rows.append([cell.v for cell in row])

    if len(rows) < 3:
        raise RuntimeError("Plan sheet has insufficient rows.")

    year_row = rows[1]  # row 2 in Excel
    week_row = rows[2]  # row 3 in Excel
    start_col = 5       # col F

    for i, row in enumerate(rows[3:], start=4):  # Excel row index starts at 1
        truck_external_id = _clean(row[0] if len(row) > 0 else None)
        if not truck_external_id or not truck_external_id.upper().startswith("L"):
            continue

        truck_info = truck_map.get(truck_external_id)
        truck_id = truck_info[0] if truck_info else None
        company_id = truck_info[1] if truck_info else None

        for col in range(start_col, min(len(row), len(year_row), len(week_row))):
            year_val = _to_int(year_row[col] if col < len(year_row) else None)
            week_val = _to_int(week_row[col] if col < len(week_row) else None)
            assignment = _clean(row[col] if col < len(row) else None)

            if not assignment:
                continue
            if year_val is None or week_val is None:
                continue
            if not (2020 <= year_val <= 2100 and 1 <= week_val <= 53):
                continue

            assignment_type = "status" if _is_status_cell(assignment) else "assignment"
            driver_id = None if assignment_type == "status" else _resolve_driver_id(assignment, driver_map)
            src_hash = hashlib.sha1(
                f"{truck_external_id}|{year_val}|{week_val}|{assignment}".encode("utf-8", errors="ignore")
            ).hexdigest()

            records.append(
                PlanRecord(
                    iso_year=year_val,
                    iso_week=week_val,
                    work_date=_iso_monday(year_val, week_val),
                    truck_external_id=truck_external_id,
                    truck_id=truck_id,
                    company_id=company_id,
                    driver_id=driver_id,
                    assignment_value=assignment,
                    assignment_type=assignment_type,
                    source_row_no=i,
                    source_row_hash=src_hash,
                    raw_payload={
                        "source": "xlsb_fahrer_plan",
                        "truck_external_id": truck_external_id,
                        "assignment_value": assignment,
                        "col_index": col + 1,
                    },
                )
            )

    return records


def run_etl(database_url: str, xlsm_path: Path, xlsb_path_override: str = "") -> dict[str, int]:
    import psycopg  # installed in project venv

    source_xlsb = Path(xlsb_path_override).expanduser() if xlsb_path_override else _discover_xlsb_path(xlsm_path)
    readable_path, created_copy = _prepare_readable_copy(source_xlsb)
    log_id = None

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO etl_log (source_name, status, details)
                VALUES (%s, 'running', %s::jsonb)
                RETURNING id
                """,
                ("xlsb_fahrer_plan", json.dumps({"source_path": str(source_xlsb)}, ensure_ascii=False)),
            )
            log_id = int(cur.fetchone()[0])
        conn.commit()

        try:
            with conn.cursor() as cur:
                truck_map, driver_map = _fetch_lookup_maps(cur)
            records = _extract_records(readable_path, truck_map, driver_map)

            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TEMP TABLE tmp_schedules
                    (LIKE schedules INCLUDING DEFAULTS)
                    ON COMMIT DROP
                    """
                )

                inserted_count = 0
                for rec in records:
                    cur.execute(
                        """
                        INSERT INTO tmp_schedules (
                            etl_log_id,
                            iso_year,
                            iso_week,
                            work_date,
                            company_id,
                            truck_id,
                            driver_id,
                            shift_code,
                            assignment_type,
                            source_sheet,
                            source_row_no,
                            source_row_hash,
                            raw_payload
                        )
                        VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb
                        )
                        """,
                        (
                            log_id,
                            rec.iso_year,
                            rec.iso_week,
                            rec.work_date,
                            rec.company_id,
                            rec.truck_id,
                            rec.driver_id,
                            rec.assignment_value,
                            rec.assignment_type,
                            PLAN_SHEET,
                            rec.source_row_no,
                            rec.source_row_hash,
                            json.dumps(rec.raw_payload, ensure_ascii=False),
                        ),
                    )
                    inserted_count += 1

                cur.execute("DELETE FROM schedules WHERE source_sheet = %s", (PLAN_SHEET,))
                deleted_count = cur.rowcount
                cur.execute(
                    """
                    INSERT INTO schedules (
                        etl_log_id,
                        iso_year,
                        iso_week,
                        work_date,
                        company_id,
                        truck_id,
                        driver_id,
                        shift_code,
                        assignment_type,
                        source_sheet,
                        source_row_no,
                        source_row_hash,
                        raw_payload
                    )
                    SELECT
                        etl_log_id,
                        iso_year,
                        iso_week,
                        work_date,
                        company_id,
                        truck_id,
                        driver_id,
                        shift_code,
                        assignment_type,
                        source_sheet,
                        source_row_no,
                        source_row_hash,
                        raw_payload
                    FROM tmp_schedules
                    """
                )

                cur.execute(
                    """
                    UPDATE etl_log
                    SET
                        status = 'success',
                        finished_at = NOW(),
                        rows_read = %s,
                        rows_inserted = %s,
                        rows_updated = 0,
                        rows_deleted = %s,
                        details = %s::jsonb
                    WHERE id = %s
                    """,
                    (
                        len(records),
                        inserted_count,
                        deleted_count,
                        json.dumps(
                            {
                                "sheet": PLAN_SHEET,
                                "trucks_known": len(truck_map),
                                "drivers_known": len(driver_map),
                                "workbook_used": str(readable_path),
                            },
                            ensure_ascii=False,
                        ),
                        log_id,
                    ),
                )
            conn.commit()

            with_driver = sum(1 for r in records if r.driver_id is not None)
            with_truck = sum(1 for r in records if r.truck_id is not None)
            return {
                "records": len(records),
                "inserted": inserted_count,
                "with_truck": with_truck,
                "with_driver": with_driver,
            }
        except Exception as exc:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE etl_log
                    SET status = 'failed', finished_at = NOW(), error_message = %s
                    WHERE id = %s
                    """,
                    (str(exc), log_id),
                )
            conn.commit()
            raise
        finally:
            if created_copy and readable_path.exists():
                try:
                    readable_path.unlink()
                except OSError:
                    pass


def main() -> int:
    parser = argparse.ArgumentParser(description="Import Fahrer plan from XLSB into schedules table.")
    parser.add_argument("--database-url", default="", help="Override DATABASE_URL from env")
    parser.add_argument("--xlsm-path", default="", help="Override EXCEL_FILE_PATH from env")
    parser.add_argument("--xlsb-path", default="", help="Override XLSB plan path")
    args = parser.parse_args()

    load_dotenv(".env", override=True)
    database_url = (args.database_url or os.getenv("DATABASE_URL", "")).strip()
    xlsm_raw = (args.xlsm_path or os.getenv("EXCEL_FILE_PATH", "")).strip()

    if not database_url:
        raise RuntimeError("DATABASE_URL is empty. Set it in .env or pass --database-url.")
    if not xlsm_raw:
        raise RuntimeError("EXCEL_FILE_PATH is empty. Set it in .env or pass --xlsm-path.")

    result = run_etl(
        database_url=database_url,
        xlsm_path=Path(xlsm_raw),
        xlsb_path_override=(args.xlsb_path or ""),
    )
    print(
        "ETL success: "
        f"records={result['records']} inserted={result['inserted']} "
        f"with_truck={result['with_truck']} with_driver={result['with_driver']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
