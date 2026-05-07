"""
Driver birthday notifier.

Reads driver birth dates from PostgreSQL and sends one Telegram notification
when active drivers have a birthday today. Designed for Windows Task Scheduler.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib import parse, request
from zoneinfo import ZoneInfo

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
LOG_FILE = BASE_DIR / "driver_birthdays.log"
DEFAULT_CHAT_ID = "745125435"


@dataclass(frozen=True)
class DriverBirthday:
    driver_db_id: int
    external_id: str
    full_name: str
    company_name: str
    phone: str
    birth_date: date
    age_years: int
    trucks: tuple[str, ...]
    iso_year: int
    iso_week: int


def _log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}\n"
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line)
    print(msg)


def _rotate_log(max_bytes: int = 256_000, keep_lines: int = 800) -> None:
    if not LOG_FILE.exists() or LOG_FILE.stat().st_size <= max_bytes:
        return
    with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()[-keep_lines:]
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        f.writelines(lines)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    return raw not in {"0", "false", "no", "off"}


def _schedule_timezone() -> ZoneInfo:
    raw = (os.getenv("DRIVER_BIRTHDAY_TIMEZONE") or "Europe/Berlin").strip()
    try:
        return ZoneInfo(raw)
    except Exception:
        return ZoneInfo("Europe/Berlin")


def _state_file_path() -> Path:
    p = (os.getenv("DRIVER_BIRTHDAY_STATE_FILE") or "").strip()
    if p:
        return Path(os.path.expandvars(p))
    return Path(os.environ.get("TEMP", r"C:\Windows\Temp")) / "lkw_driver_birthday_state.json"


def _load_state(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_state(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def parse_birth_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)):
        if 1 <= float(value) <= 60000:
            return date(1899, 12, 30) + timedelta(days=int(float(value)))
        return None

    text = str(value).strip()
    if not text or text.lower() in {"none", "null", "nan", "nat", "-", "n/a"}:
        return None
    text = text.split("T", 1)[0].split(" ", 1)[0].strip()
    text = text.replace("\\", "/")

    for fmt in ("%d/%m/%Y", "%d.%m.%Y", "%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def age_on(birth_date: date, today: date) -> int:
    years = today.year - birth_date.year
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        years -= 1
    return years


def _format_birth_date(value: date) -> str:
    return value.strftime("%d/%m/%Y")


def _send_telegram(text: str) -> None:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    chat_id = (
        (os.getenv("DRIVER_BIRTHDAY_NOTIFY_CHAT_ID") or "").strip()
        or (os.getenv("ADMIN_CHAT_ID") or "").strip()
        or DEFAULT_CHAT_ID
    )
    if not token or not chat_id:
        _log("WARN: TELEGRAM_BOT_TOKEN or chat id is empty, skip notification")
        return

    payload = parse.urlencode({"chat_id": chat_id, "text": text}).encode("utf-8")
    req = request.Request(
        url=f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with request.urlopen(req, timeout=20) as resp:
        resp.read()


def _truck_label(external_id: str | None, plate_number: str | None) -> str:
    ext = str(external_id or "").strip()
    plate = str(plate_number or "").strip()
    if ext and plate and ext != plate:
        return f"{ext} ({plate})"
    return ext or plate or "-"


def _fetch_today_birthdays(database_url: str, today: date) -> list[DriverBirthday]:
    import psycopg

    include_inactive = _env_bool("DRIVER_BIRTHDAY_INCLUDE_INACTIVE", False)
    iso_year, iso_week, _ = today.isocalendar()

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    d.id,
                    COALESCE(d.external_id, '') AS external_id,
                    d.full_name,
                    COALESCE(d.phone, '') AS phone,
                    COALESCE(c.name, '') AS company_name,
                    COALESCE(
                        NULLIF(d.raw_payload->>'Geburtsdatum', ''),
                        NULLIF(d.raw_payload->>'Birth Date', ''),
                        NULLIF(d.raw_payload->>'Birth date', ''),
                        NULLIF(d.raw_payload->>'Geburtsdatum des Fahrers', '')
                    ) AS birth_raw
                FROM drivers d
                LEFT JOIN companies c ON c.id = d.company_id
                WHERE (%s OR d.is_active IS TRUE)
                ORDER BY d.full_name
                """,
                (include_inactive,),
            )
            rows = cur.fetchall()

            birthdays: list[tuple[int, str, str, str, str, date, int]] = []
            driver_ids: list[int] = []
            for driver_id, external_id, full_name, phone, company_name, birth_raw in rows:
                birth_date = parse_birth_date(birth_raw)
                if birth_date is None:
                    continue
                if (birth_date.month, birth_date.day) != (today.month, today.day):
                    continue
                db_id = int(driver_id)
                driver_ids.append(db_id)
                birthdays.append(
                    (
                        db_id,
                        str(external_id or "").strip(),
                        str(full_name or "").strip(),
                        str(phone or "").strip(),
                        str(company_name or "").strip(),
                        birth_date,
                        age_on(birth_date, today),
                    )
                )

            truck_map: dict[int, list[str]] = {driver_id: [] for driver_id in driver_ids}
            if driver_ids:
                cur.execute(
                    """
                    SELECT
                        s.driver_id,
                        t.external_id,
                        COALESCE(
                            NULLIF(t.plate_number, ''),
                            NULLIF(t.raw_payload->>'LKW-Nummer', ''),
                            NULLIF(t.raw_payload->>'Number', '')
                        ) AS plate_number
                    FROM schedules s
                    LEFT JOIN trucks t ON t.id = s.truck_id
                    WHERE s.driver_id = ANY(%s)
                      AND s.iso_year = %s
                      AND s.iso_week = %s
                      AND COALESCE(s.assignment_type, '') = 'assignment'
                    ORDER BY s.driver_id, t.external_id
                    """,
                    (driver_ids, iso_year, iso_week),
                )
                for driver_id, external_id, plate_number in cur.fetchall():
                    label = _truck_label(external_id, plate_number)
                    labels = truck_map.setdefault(int(driver_id), [])
                    if label != "-" and label not in labels:
                        labels.append(label)

    result = []
    for db_id, external_id, full_name, phone, company_name, birth_date, age_years in birthdays:
        trucks = tuple(truck_map.get(db_id) or ("-",))
        result.append(
            DriverBirthday(
                driver_db_id=db_id,
                external_id=external_id,
                full_name=full_name,
                company_name=company_name,
                phone=phone,
                birth_date=birth_date,
                age_years=age_years,
                trucks=trucks,
                iso_year=iso_year,
                iso_week=iso_week,
            )
        )
    return result


def build_message(items: list[DriverBirthday], today: date) -> str:
    lines = [
        f"Geburtstag Fahrer - heute {_format_birth_date(today)}",
        "",
    ]
    for idx, item in enumerate(items, start=1):
        driver_ref = f"{item.external_id} - {item.full_name}" if item.external_id else item.full_name
        lines.extend(
            [
                f"{idx}. {driver_ref}",
                f"Firma: {item.company_name or '-'}",
                f"Telefon: {item.phone or '-'}",
                f"Geburtsdatum: {_format_birth_date(item.birth_date)}",
                f"Alter: {item.age_years} Jahre",
                f"LKW W{item.iso_week:02d}/{item.iso_year}: {', '.join(item.trucks) or '-'}",
                "",
            ]
        )
    return "\n".join(lines).strip()


def main() -> int:
    load_dotenv(BASE_DIR / ".env", override=True)
    _rotate_log()

    database_url = (os.getenv("DATABASE_URL") or "").strip()
    if not database_url:
        _log("FAILED: DATABASE_URL is empty")
        return 2

    now_local = datetime.now(_schedule_timezone())
    today = now_local.date()
    state_path = _state_file_path()
    state = _load_state(state_path)

    birthdays = _fetch_today_birthdays(database_url, today)
    birthday_ids = sorted(item.driver_db_id for item in birthdays)
    state_key = f"{today.isoformat()}:{','.join(str(x) for x in birthday_ids)}"
    already_sent = state.get("last_sent_key") == state_key

    _log(
        "birthday_check: "
        f"date={today.isoformat()} count={len(birthdays)} ids={','.join(str(x) for x in birthday_ids)} "
        f"already_sent={already_sent}"
    )

    if birthdays and not already_sent:
        _send_telegram(build_message(birthdays, today))
        state["last_sent_key"] = state_key
        state["last_sent_at"] = int(time.time())
        state["last_sent_count"] = len(birthdays)
        _save_state(state_path, state)
        _log("birthday_notification_sent=true")
        return 0

    if (not birthdays) and _env_bool("DRIVER_BIRTHDAY_NOTIFY_EMPTY", False):
        empty_key = f"{today.isoformat()}:empty"
        if state.get("last_sent_key") != empty_key:
            _send_telegram(f"Geburtstag Fahrer - heute {_format_birth_date(today)}\nKeine Geburtstage.")
            state["last_sent_key"] = empty_key
            state["last_sent_at"] = int(time.time())
            state["last_sent_count"] = 0
            _save_state(state_path, state)
            _log("birthday_empty_notification_sent=true")

    state["last_checked_at"] = int(time.time())
    state["last_checked_date"] = today.isoformat()
    state["last_checked_count"] = len(birthdays)
    _save_state(state_path, state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
