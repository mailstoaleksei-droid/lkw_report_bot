"""
ETL: LKW_Fahrer_Data.xlsm -> PostgreSQL (Neon)

Phase 1.3 MVP:
- reads master data from sheets "LKW" and "Fahrer"
- reads monthly revenue data from sheet "Bericht_Dispo"
- reads monthly bonus dynamics from sheet "BonusDynamik"
- upserts companies, trucks, drivers
- writes run metadata to etl_log
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import shutil
import tempfile
import time
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import date, datetime
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv
import openpyxl


def _lazy_import_psycopg():
    try:
        import psycopg  # type: ignore
    except Exception as exc:  # pragma: no cover - runtime dependency message
        raise RuntimeError(
            "psycopg is required. Install dependencies from requirements.txt "
            "and ensure DATABASE_URL is set."
        ) from exc
    return psycopg


REQUIRED_TRUCK_KEYS = ("lkwid", "lkwnummer")
REQUIRED_DRIVER_KEYS = ("fahrerid", "fahrername")
BERICHT_DISPO_SHEET = "Bericht_Dispo"
BONUS_DYNAMIK_SHEET = "BonusDynamik"
MONTHS_DE = {
    "januar": (1, "Januar"),
    "jan": (1, "Januar"),
    "january": (1, "Januar"),
    "februar": (2, "Februar"),
    "feb": (2, "Februar"),
    "february": (2, "Februar"),
    "maerz": (3, "Maerz"),
    "marz": (3, "Maerz"),
    "march": (3, "Maerz"),
    "april": (4, "April"),
    "apr": (4, "April"),
    "mai": (5, "Mai"),
    "may": (5, "Mai"),
    "juni": (6, "Juni"),
    "jun": (6, "Juni"),
    "june": (6, "Juni"),
    "juli": (7, "Juli"),
    "jul": (7, "Juli"),
    "july": (7, "Juli"),
    "august": (8, "August"),
    "aug": (8, "August"),
    "september": (9, "September"),
    "sep": (9, "September"),
    "sept": (9, "September"),
    "oktober": (10, "Oktober"),
    "okt": (10, "Oktober"),
    "october": (10, "Oktober"),
    "oct": (10, "Oktober"),
    "november": (11, "November"),
    "nov": (11, "November"),
    "dezember": (12, "Dezember"),
    "dez": (12, "Dezember"),
    "december": (12, "Dezember"),
    "dec": (12, "Dezember"),
}


def _norm(value: object) -> str:
    s = str(value or "").strip().lower()
    repl = (
        ("ä", "a"),
        ("ö", "o"),
        ("ü", "u"),
        ("ß", "ss"),
        ("\n", " "),
    )
    for a, b in repl:
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "", s)


def _clean_text(value: object) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _parse_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        d = value.date()
    elif isinstance(value, date):
        d = value
    else:
        s = str(value).strip()
        if not s or s == "00:00:00":
            return None
        if " " in s:
            s = s.split(" ", 1)[0]
        try:
            d = datetime.fromisoformat(s).date()
        except ValueError:
            return None
    if d.year < 1970 or d.year > 2100:
        return None
    return d


def _parse_decimal(value: object) -> Decimal:
    if value is None:
        return Decimal("0.00")
    if isinstance(value, Decimal):
        return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if isinstance(value, (int, float)):
        return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    raw = str(value).strip()
    if not raw:
        return Decimal("0.00")
    if raw.upper() in {"#REF!", "#N/A", "N/A"}:
        return Decimal("0.00")

    cleaned = raw.replace(" ", "").replace("\u00a0", "")
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    cleaned = re.sub(r"[^0-9.\-]+", "", cleaned)
    if cleaned in {"", "-", ".", "-."}:
        return Decimal("0.00")

    try:
        return Decimal(cleaned).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return Decimal("0.00")


def _parse_month_token(value: object) -> tuple[int, str] | None:
    key = _norm(value)
    if not key:
        return None
    return MONTHS_DE.get(key)


def _find_metric_row(ws, aliases: Iterable[str], max_scan_rows: int = 120, max_scan_cols: int = 8) -> int | None:
    normalized_aliases = {_norm(a) for a in aliases if _norm(a)}
    if not normalized_aliases:
        return None
    for row_idx in range(1, max_scan_rows + 1):
        for col_idx in range(1, max_scan_cols + 1):
            token = _norm(ws.cell(row=row_idx, column=col_idx).value)
            if token in normalized_aliases:
                return row_idx
    return None


def _discover_month_columns(ws, preferred_row: int = 6, max_scan_rows: int = 30) -> dict[int, tuple[str, int]]:
    def parse_row(row_idx: int) -> dict[int, tuple[str, int]]:
        found: dict[int, tuple[str, int]] = {}
        for col_idx in range(1, ws.max_column + 1):
            parsed = _parse_month_token(ws.cell(row=row_idx, column=col_idx).value)
            if not parsed:
                continue
            month_idx, month_name = parsed
            if month_idx not in found:
                found[month_idx] = (month_name, col_idx)
        return found

    preferred = parse_row(preferred_row)
    if len(preferred) >= 10:
        return preferred

    best: dict[int, tuple[str, int]] = preferred
    for row_idx in range(1, max_scan_rows + 1):
        found = parse_row(row_idx)
        if len(found) > len(best):
            best = found
    return best


def _find_header_row(ws, required_keys: Iterable[str], max_scan_rows: int = 50) -> int:
    required = set(required_keys)
    for row_idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
        if row_idx > max_scan_rows:
            break
        normalized = {_norm(v) for v in row if _norm(v)}
        if required.issubset(normalized):
            return row_idx
    raise RuntimeError(f"Header row not found in sheet '{ws.title}' for keys: {sorted(required)}")


def _get_row_values(ws, row_idx: int) -> list[object]:
    return [cell for cell in next(ws.iter_rows(min_row=row_idx, max_row=row_idx, values_only=True))]


def _build_col_index(header_row: list[object]) -> dict[str, int]:
    index: dict[str, int] = {}
    for i, v in enumerate(header_row):
        k = _norm(v)
        if k and k not in index:
            index[k] = i
    return index


def _pick_col(index: dict[str, int], *aliases: str) -> int | None:
    for alias in aliases:
        k = _norm(alias)
        if k in index:
            return index[k]
    return None


@dataclass
class TruckRow:
    external_id: str
    plate_number: str | None
    truck_type: str | None
    company_name: str | None
    status: str | None
    status_since: date | None
    is_active: bool
    raw_payload: dict[str, str | None]


@dataclass
class DriverRow:
    external_id: str
    full_name: str
    company_name: str | None
    phone: str | None
    is_active: bool
    raw_payload: dict[str, str | None]


@dataclass
class EinnahmenMonthRow:
    month_index: int
    month_name: str
    nahverkehr: Decimal
    logistics: Decimal
    gesamt: Decimal
    raw_payload: dict[str, object]


@dataclass
class BonusDynamikRow:
    report_year: int
    report_month: int
    month_start: date
    fahrer_id: str
    fahrer_name: str
    days: int
    km: Decimal
    pct_km: Decimal
    ct: int
    pct_ct: Decimal
    bonus: Decimal
    penalty: Decimal
    final: Decimal
    raw_payload: dict[str, object]


def _iter_sheet_rows(ws, header_row_idx: int):
    for row in ws.iter_rows(min_row=header_row_idx + 1, values_only=True):
        yield list(row)


def extract_trucks(wb) -> list[TruckRow]:
    ws = wb["LKW"]
    header_row_idx = _find_header_row(ws, REQUIRED_TRUCK_KEYS)
    header = _get_row_values(ws, header_row_idx)
    index = _build_col_index(header)

    col_id = _pick_col(index, "LKW-ID", "ID")
    col_num = _pick_col(index, "LKW-Nummer", "Number")
    col_type = _pick_col(index, "LKW-Typ", "Type")
    col_company = _pick_col(index, "Firma", "Company")
    col_status = _pick_col(index, "Status")
    col_sale_date = _pick_col(index, "Datum verkauft", "Sale Date")

    rows: list[TruckRow] = []
    for row in _iter_sheet_rows(ws, header_row_idx):
        if col_id is None or col_id >= len(row):
            continue
        external_id = _clean_text(row[col_id])
        if not external_id or not external_id.upper().startswith("L"):
            continue

        status = _clean_text(row[col_status]) if col_status is not None and col_status < len(row) else None
        status_norm = _norm(status)
        is_active = status_norm not in {"verkauft", "ruckgabe", "rueckgabe", "sold", "inactive"}

        payload = {
            str(header[i]).strip() if i < len(header) and header[i] is not None else f"col_{i+1}":
            _clean_text(row[i]) if i < len(row) else None
            for i in range(len(header))
        }

        rows.append(
            TruckRow(
                external_id=external_id,
                plate_number=_clean_text(row[col_num]) if col_num is not None and col_num < len(row) else None,
                truck_type=_clean_text(row[col_type]) if col_type is not None and col_type < len(row) else None,
                company_name=_clean_text(row[col_company]) if col_company is not None and col_company < len(row) else None,
                status=status,
                status_since=_parse_date(row[col_sale_date]) if col_sale_date is not None and col_sale_date < len(row) else None,
                is_active=is_active,
                raw_payload=payload,
            )
        )
    return rows


def extract_drivers(wb) -> list[DriverRow]:
    ws = wb["Fahrer"]
    header_row_idx = _find_header_row(ws, REQUIRED_DRIVER_KEYS)
    header = _get_row_values(ws, header_row_idx)
    index = _build_col_index(header)

    col_id = _pick_col(index, "Fahrer-ID", "ID")
    col_name = _pick_col(index, "Fahrername", "Name")
    col_company = _pick_col(index, "Firma", "Company")
    col_phone = _pick_col(index, "Telefonnummer", "Phone")
    col_status = _pick_col(index, "Status", "Active/Fired")

    rows: list[DriverRow] = []
    for row in _iter_sheet_rows(ws, header_row_idx):
        if col_id is None or col_name is None:
            continue
        if col_id >= len(row) or col_name >= len(row):
            continue
        external_id = _clean_text(row[col_id])
        full_name = _clean_text(row[col_name])
        if not external_id or not full_name or not external_id.upper().startswith("F"):
            continue

        status = _clean_text(row[col_status]) if col_status is not None and col_status < len(row) else None
        status_norm = _norm(status)
        is_active = status_norm not in {"fired", "entlassen", "inactive", "inaktiv"}

        payload = {
            str(header[i]).strip() if i < len(header) and header[i] is not None else f"col_{i+1}":
            _clean_text(row[i]) if i < len(row) else None
            for i in range(len(header))
        }

        rows.append(
            DriverRow(
                external_id=external_id,
                full_name=full_name,
                company_name=_clean_text(row[col_company]) if col_company is not None and col_company < len(row) else None,
                phone=_clean_text(row[col_phone]) if col_phone is not None and col_phone < len(row) else None,
                is_active=is_active,
                raw_payload=payload,
            )
        )
    return rows


def extract_einnahmen_months(wb) -> list[EinnahmenMonthRow]:
    if BERICHT_DISPO_SHEET not in wb.sheetnames:
        return []

    ws = wb[BERICHT_DISPO_SHEET]
    month_columns = _discover_month_columns(ws, preferred_row=6)
    if len(month_columns) < 2:
        return []

    nahverkehr_row = _find_metric_row(ws, ("Nahverkehr",))
    logistics_row = _find_metric_row(ws, ("Logistics",))
    gesamt_row = _find_metric_row(ws, ("Gesamt", "Total"))
    if nahverkehr_row is None or logistics_row is None or gesamt_row is None:
        return []

    rows: list[EinnahmenMonthRow] = []
    for month_idx in sorted(month_columns.keys()):
        month_name, col_idx = month_columns[month_idx]
        nah = _parse_decimal(ws.cell(row=nahverkehr_row, column=col_idx).value)
        log = _parse_decimal(ws.cell(row=logistics_row, column=col_idx).value)
        ges = _parse_decimal(ws.cell(row=gesamt_row, column=col_idx).value)

        rows.append(
            EinnahmenMonthRow(
                month_index=month_idx,
                month_name=month_name,
                nahverkehr=nah,
                logistics=log,
                gesamt=ges,
                raw_payload={
                    "sheet": BERICHT_DISPO_SHEET,
                    "month_column": col_idx,
                    "nahverkehr_row": nahverkehr_row,
                    "logistics_row": logistics_row,
                    "gesamt_row": gesamt_row,
                },
            )
        )
    return rows


def _bonus_header_token(value: object) -> str:
    return str(value or "").strip().upper().replace("\u00a0", "").replace(" ", "").replace("％", "%")


def _parse_month_start(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return date(value.year, value.month, 1)
    if isinstance(value, date):
        return date(value.year, value.month, 1)

    raw = str(value).strip()
    if not raw:
        return None

    for fmt in ("%d/%m/%Y", "%m/%d/%Y", "%d.%m.%Y", "%Y-%m-%d"):
        try:
            d = datetime.strptime(raw, fmt).date()
            return date(d.year, d.month, 1)
        except ValueError:
            pass

    m = re.match(r"^\s*([A-Za-zА-Яа-яÄÖÜäöü]+)\s*[-./ ]\s*(\d{2,4})\s*$", raw)
    if m:
        month_token, year_token = m.group(1), m.group(2)
        parsed_month = _parse_month_token(month_token)
        if parsed_month:
            month_idx = parsed_month[0]
            year_num = int(year_token)
            if year_num < 100:
                year_num += 2000
            if 1970 <= year_num <= 2100:
                return date(year_num, month_idx, 1)

    return None


def _parse_percent_cell(ws, row_idx: int, col_idx: int) -> Decimal:
    cell = ws.cell(row=row_idx, column=col_idx)
    parsed = _parse_decimal(cell.value)
    if "%" in str(cell.number_format or "") and abs(parsed) <= Decimal("3"):
        parsed = (parsed * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return parsed


def _parse_int_cell(ws, row_idx: int, col_idx: int) -> int:
    parsed = _parse_decimal(ws.cell(row=row_idx, column=col_idx).value)
    return int(parsed.to_integral_value(rounding=ROUND_HALF_UP))


def extract_bonus_dynamik_months(wb) -> list[BonusDynamikRow]:
    if BONUS_DYNAMIK_SHEET not in wb.sheetnames:
        return []

    ws = wb[BONUS_DYNAMIK_SHEET]
    max_col = int(ws.max_column or 0)
    max_row = int(ws.max_row or 0)
    if max_col < 10 or max_row < 3:
        return []

    expected_headers = ["DAYS", "KM", "%KM", "CT", "%CT", "BONUS", "PENALTY", "FINAL"]
    month_blocks: list[tuple[int, date]] = []
    seen_months: set[tuple[int, int]] = set()
    for start_col in range(3, max_col - 7 + 1):
        sequence = [_bonus_header_token(ws.cell(row=2, column=start_col + off).value) for off in range(8)]
        if sequence != expected_headers:
            continue
        month_start = _parse_month_start(ws.cell(row=1, column=start_col).value)
        if not month_start:
            continue
        month_key = (month_start.year, month_start.month)
        if month_key in seen_months:
            continue
        seen_months.add(month_key)
        month_blocks.append((start_col, month_start))

    if not month_blocks:
        return []

    by_key: dict[tuple[int, int, str], BonusDynamikRow] = {}
    for row_idx in range(3, max_row + 1):
        fahrer_id = _clean_text(ws.cell(row=row_idx, column=1).value) or ""
        fahrer_name = _clean_text(ws.cell(row=row_idx, column=2).value) or ""
        if not fahrer_id and not fahrer_name:
            continue
        if not fahrer_id:
            continue

        for start_col, month_start in month_blocks:
            key = (month_start.year, month_start.month, fahrer_id.upper())
            by_key[key] = BonusDynamikRow(
                report_year=month_start.year,
                report_month=month_start.month,
                month_start=month_start,
                fahrer_id=fahrer_id,
                fahrer_name=fahrer_name,
                days=_parse_int_cell(ws, row_idx, start_col),
                km=_parse_decimal(ws.cell(row=row_idx, column=start_col + 1).value),
                pct_km=_parse_percent_cell(ws, row_idx, start_col + 2),
                ct=_parse_int_cell(ws, row_idx, start_col + 3),
                pct_ct=_parse_percent_cell(ws, row_idx, start_col + 4),
                bonus=_parse_decimal(ws.cell(row=row_idx, column=start_col + 5).value),
                penalty=_parse_decimal(ws.cell(row=row_idx, column=start_col + 6).value),
                final=_parse_decimal(ws.cell(row=row_idx, column=start_col + 7).value),
                raw_payload={
                    "sheet": BONUS_DYNAMIK_SHEET,
                    "row": row_idx,
                    "month_col": start_col,
                },
            )
    return [by_key[k] for k in sorted(by_key.keys())]


def _prepare_readable_xlsm(source_path: Path) -> tuple[Path, bool]:
    """
    Returns (path, is_temp_copy_created_by_this_run).
    """
    if not source_path.exists():
        raise FileNotFoundError(f"XLSM source file not found: {source_path}")

    temp_dir = Path(tempfile.gettempdir())
    run_copy = temp_dir / f"LKW_Fahrer_Data_ETL_{int(time.time())}.xlsm"
    try:
        shutil.copy2(source_path, run_copy)
        return run_copy, True
    except Exception:
        pass

    fallback_candidates = sorted(
        glob.glob(str(temp_dir / "LKW_Fahrer_Data*.xlsm")),
        key=lambda p: Path(p).stat().st_mtime,
        reverse=True,
    )
    if fallback_candidates:
        return Path(fallback_candidates[0]), False

    raise PermissionError(
        "Could not create temp copy from EXCEL_FILE_PATH and no fallback copy was found in %TEMP%."
    )


def _upsert_company(cur, name: str) -> int:
    cur.execute(
        """
        INSERT INTO companies (name)
        VALUES (%s)
        ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
        RETURNING id
        """,
        (name,),
    )
    return int(cur.fetchone()[0])


def _ensure_einnahmen_table(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS report_einnahmen_monthly (
            month_index SMALLINT PRIMARY KEY CHECK (month_index BETWEEN 1 AND 12),
            month_name TEXT NOT NULL,
            nahverkehr NUMERIC(14, 2) NOT NULL DEFAULT 0,
            logistics NUMERIC(14, 2) NOT NULL DEFAULT 0,
            gesamt NUMERIC(14, 2) NOT NULL DEFAULT 0,
            raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )


def _ensure_bonus_table(cur) -> None:
    cur.execute(
        """
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
            raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (report_year, report_month, fahrer_id)
        )
        """
    )
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_report_bonus_dynamik_lookup
            ON report_bonus_dynamik_monthly (report_year, report_month, fahrer_name)
        """
    )


def run_etl(database_url: str, xlsm_path: Path) -> dict[str, int]:
    psycopg = _lazy_import_psycopg()
    created_copy = False
    readable_path = xlsm_path
    log_id = None

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO etl_log (source_name, status, details)
                VALUES (%s, 'running', %s::jsonb)
                RETURNING id
                """,
                ("xlsm_lkw_fahrer_data", json.dumps({"source_path": str(xlsm_path)}, ensure_ascii=False)),
            )
            log_id = int(cur.fetchone()[0])
        conn.commit()

        try:
            readable_path, created_copy = _prepare_readable_xlsm(xlsm_path)
            wb = openpyxl.load_workbook(readable_path, read_only=True, data_only=True, keep_vba=False)
            trucks = extract_trucks(wb)
            drivers = extract_drivers(wb)
            einnahmen_rows = extract_einnahmen_months(wb)
            bonus_rows = extract_bonus_dynamik_months(wb)
            wb.close()

            company_names = sorted(
                {
                    c.strip()
                    for c in [*(t.company_name for t in trucks), *(d.company_name for d in drivers)]
                    if c and c.strip()
                }
            )

            with conn.cursor() as cur:
                company_ids: dict[str, int] = {}
                for name in company_names:
                    company_ids[name] = _upsert_company(cur, name)

                _ensure_einnahmen_table(cur)
                _ensure_bonus_table(cur)

                rows_inserted = 0
                rows_updated = 0
                rows_deleted = 0

                for t in trucks:
                    company_id = company_ids.get(t.company_name or "")
                    cur.execute(
                        """
                        INSERT INTO trucks (
                            external_id, plate_number, truck_type, company_id, status, status_since,
                            is_active, source_row_hash, raw_payload, updated_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, NULL, %s::jsonb, NOW())
                        ON CONFLICT (external_id) DO UPDATE SET
                            plate_number = EXCLUDED.plate_number,
                            truck_type = EXCLUDED.truck_type,
                            company_id = EXCLUDED.company_id,
                            status = EXCLUDED.status,
                            status_since = EXCLUDED.status_since,
                            is_active = EXCLUDED.is_active,
                            raw_payload = EXCLUDED.raw_payload,
                            updated_at = NOW()
                        RETURNING (xmax = 0) AS inserted
                        """,
                        (
                            t.external_id,
                            t.plate_number,
                            t.truck_type,
                            company_id,
                            t.status,
                            t.status_since,
                            t.is_active,
                            json.dumps(t.raw_payload, ensure_ascii=False),
                        ),
                    )
                    inserted = bool(cur.fetchone()[0])
                    rows_inserted += 1 if inserted else 0
                    rows_updated += 0 if inserted else 1

                for d in drivers:
                    company_id = company_ids.get(d.company_name or "")
                    cur.execute(
                        """
                        INSERT INTO drivers (
                            external_id, full_name, phone, company_id, is_active,
                            source_row_hash, raw_payload, updated_at
                        )
                        VALUES (%s, %s, %s, %s, %s, NULL, %s::jsonb, NOW())
                        ON CONFLICT (external_id) DO UPDATE SET
                            full_name = EXCLUDED.full_name,
                            phone = EXCLUDED.phone,
                            company_id = EXCLUDED.company_id,
                            is_active = EXCLUDED.is_active,
                            raw_payload = EXCLUDED.raw_payload,
                            updated_at = NOW()
                        RETURNING (xmax = 0) AS inserted
                        """,
                        (
                            d.external_id,
                            d.full_name,
                            d.phone,
                            company_id,
                            d.is_active,
                            json.dumps(d.raw_payload, ensure_ascii=False),
                        ),
                    )
                    inserted = bool(cur.fetchone()[0])
                    rows_inserted += 1 if inserted else 0
                    rows_updated += 0 if inserted else 1

                cur.execute("DELETE FROM report_einnahmen_monthly")
                rows_deleted += int(cur.rowcount or 0)
                for rec in einnahmen_rows:
                    cur.execute(
                        """
                        INSERT INTO report_einnahmen_monthly (
                            month_index,
                            month_name,
                            nahverkehr,
                            logistics,
                            gesamt,
                            raw_payload,
                            updated_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb, NOW())
                        """,
                        (
                            rec.month_index,
                            rec.month_name,
                            rec.nahverkehr,
                            rec.logistics,
                            rec.gesamt,
                            json.dumps(rec.raw_payload, ensure_ascii=False),
                        ),
                    )
                    rows_inserted += 1

                cur.execute("DELETE FROM report_bonus_dynamik_monthly")
                rows_deleted += int(cur.rowcount or 0)
                for rec in bonus_rows:
                    cur.execute(
                        """
                        INSERT INTO report_bonus_dynamik_monthly (
                            report_year,
                            report_month,
                            month_start,
                            fahrer_id,
                            fahrer_name,
                            days,
                            km,
                            pct_km,
                            ct,
                            pct_ct,
                            bonus,
                            penalty,
                            final,
                            raw_payload,
                            updated_at
                        )
                        VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, NOW()
                        )
                        """,
                        (
                            rec.report_year,
                            rec.report_month,
                            rec.month_start,
                            rec.fahrer_id,
                            rec.fahrer_name,
                            rec.days,
                            rec.km,
                            rec.pct_km,
                            rec.ct,
                            rec.pct_ct,
                            rec.bonus,
                            rec.penalty,
                            rec.final,
                            json.dumps(rec.raw_payload, ensure_ascii=False),
                        ),
                    )
                    rows_inserted += 1

                cur.execute(
                    """
                    UPDATE etl_log
                    SET
                        status = 'success',
                        finished_at = NOW(),
                        rows_read = %s,
                        rows_inserted = %s,
                        rows_updated = %s,
                        rows_deleted = %s,
                        details = %s::jsonb
                    WHERE id = %s
                    """,
                    (
                        len(trucks) + len(drivers) + len(einnahmen_rows) + len(bonus_rows),
                        rows_inserted,
                        rows_updated,
                        rows_deleted,
                        json.dumps(
                            {
                                "companies": len(company_names),
                                "trucks": len(trucks),
                                "drivers": len(drivers),
                                "einnahmen_months": len(einnahmen_rows),
                                "bonus_rows": len(bonus_rows),
                                "workbook_used": str(readable_path),
                            },
                            ensure_ascii=False,
                        ),
                        log_id,
                    ),
                )
            conn.commit()

            return {
                "companies": len(company_names),
                "trucks": len(trucks),
                "drivers": len(drivers),
                "einnahmen_months": len(einnahmen_rows),
                "bonus_rows": len(bonus_rows),
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
    parser = argparse.ArgumentParser(description="Import LKW/Fahrer master data from XLSM to PostgreSQL.")
    parser.add_argument("--database-url", default="", help="Override DATABASE_URL from env")
    parser.add_argument("--xlsm-path", default="", help="Override EXCEL_FILE_PATH from env")
    args = parser.parse_args()

    load_dotenv(override=True)
    database_url = (args.database_url or os.getenv("DATABASE_URL", "")).strip()
    xlsm_raw = (args.xlsm_path or os.getenv("EXCEL_FILE_PATH", "")).strip()

    if not database_url:
        raise RuntimeError("DATABASE_URL is empty. Set it in .env or pass --database-url.")
    if not xlsm_raw:
        raise RuntimeError("EXCEL_FILE_PATH is empty. Set it in .env or pass --xlsm-path.")

    result = run_etl(database_url=database_url, xlsm_path=Path(xlsm_raw))
    print(
        f"ETL success: companies={result['companies']} "
        f"trucks={result['trucks']} drivers={result['drivers']} "
        f"einnahmen_months={result['einnahmen_months']} "
        f"bonus_rows={result['bonus_rows']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
