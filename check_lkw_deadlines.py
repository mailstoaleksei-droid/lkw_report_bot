"""
LKW deadline notifier for HU, SP and 57B.

Reads truck deadline month values from PostgreSQL and sends notifications one
month before the due month. Designed for Windows Task Scheduler.
"""

from __future__ import annotations

import json
import os
import smtplib
import ssl
import time
from dataclasses import dataclass
from datetime import date, datetime
from email.message import EmailMessage
from pathlib import Path
from urllib import parse, request
from zoneinfo import ZoneInfo

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
LOG_FILE = BASE_DIR / "lkw_deadlines.log"
DEFAULT_CHAT_ID = "6863783942"
DEFAULT_EMAIL_TO = "a.reh@groo.de"
DEADLINE_FIELDS = ("HU", "SP", "57B")


@dataclass(frozen=True)
class LkwDeadline:
    truck_db_id: int
    lkw_id: str
    lkw_number: str
    field_name: str
    due_month: date
    notify_date: date


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


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return max(minimum, default)
    try:
        return max(minimum, int(raw))
    except ValueError:
        return max(minimum, default)


def _schedule_timezone() -> ZoneInfo:
    raw = (os.getenv("LKW_DEADLINE_TIMEZONE") or "Europe/Berlin").strip()
    try:
        return ZoneInfo(raw)
    except Exception:
        return ZoneInfo("Europe/Berlin")


def _state_file_path() -> Path:
    p = (os.getenv("LKW_DEADLINE_STATE_FILE") or "").strip()
    if p:
        return Path(os.path.expandvars(p))
    return Path(os.environ.get("TEMP", r"C:\Windows\Temp")) / "lkw_deadline_notify_state.json"


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


def parse_due_month(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return date(value.year, value.month, 1)
    if isinstance(value, date):
        return date(value.year, value.month, 1)

    text = str(value).strip()
    if not text or text.lower() in {"none", "null", "nan", "nat", "-", "n/a"}:
        return None
    text = text.split("T", 1)[0].split(" ", 1)[0].strip()
    text = text.replace("\\", "/").replace(".", "/").replace("-", "/")

    parts = [part for part in text.split("/") if part]
    if len(parts) >= 2:
        try:
            first = int(float(parts[0]))
            second = int(float(parts[1]))
        except ValueError:
            return None
        if first > 1900 and 1 <= second <= 12:
            return date(first, second, 1)
        if 1 <= first <= 12 and second > 1900:
            return date(second, first, 1)
    return None


def previous_month_start(value: date) -> date:
    year = value.year
    month = value.month - 1
    if month == 0:
        month = 12
        year -= 1
    return date(year, month, 1)


def _format_month(value: date) -> str:
    return value.strftime("%m/%Y")


def _format_date(value: date) -> str:
    return value.strftime("%d/%m/%Y")


def _send_telegram(text: str) -> None:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    chat_id = (os.getenv("LKW_DEADLINE_NOTIFY_CHAT_ID") or DEFAULT_CHAT_ID).strip()
    if not token or not chat_id:
        _log("WARN: TELEGRAM_BOT_TOKEN or LKW_DEADLINE_NOTIFY_CHAT_ID is empty, skip Telegram")
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


def _email_recipients() -> list[str]:
    raw = (os.getenv("LKW_DEADLINE_NOTIFY_EMAIL") or DEFAULT_EMAIL_TO).strip()
    return [item.strip() for item in raw.split(",") if item.strip()]


def _send_email(subject: str, text: str) -> bool:
    host = (os.getenv("SMTP_HOST") or "").strip()
    user = (os.getenv("SMTP_USER") or "").strip()
    password = (os.getenv("SMTP_PASSWORD") or "").strip()
    sender = (os.getenv("SMTP_FROM") or user).strip()
    recipients = _email_recipients()
    if not host or not sender or not recipients:
        _log("WARN: SMTP_HOST, SMTP_FROM/SMTP_USER or LKW_DEADLINE_NOTIFY_EMAIL is empty, skip email")
        return False

    port = _env_int("SMTP_PORT", 587, minimum=1)
    use_tls = _env_bool("SMTP_USE_TLS", True)
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg.set_content(text)

    if use_tls:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            if user and password:
                smtp.login(user, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP_SSL(host, port, timeout=30, context=ssl.create_default_context()) as smtp:
            if user and password:
                smtp.login(user, password)
            smtp.send_message(msg)
    return True


def _fetch_deadlines(database_url: str) -> list[LkwDeadline]:
    import psycopg

    include_inactive = _env_bool("LKW_DEADLINE_INCLUDE_INACTIVE", False)
    result: list[LkwDeadline] = []
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    COALESCE(external_id, '') AS lkw_id,
                    COALESCE(
                        NULLIF(plate_number, ''),
                        NULLIF(raw_payload->>'LKW-Nummer', ''),
                        NULLIF(raw_payload->>'Number', '')
                    ) AS lkw_number,
                    COALESCE(NULLIF(raw_payload->>'HU', ''), NULLIF(raw_payload->>'Nächste TÜV', ''), NULLIF(raw_payload->>'Naechste TUEV', ''), NULLIF(raw_payload->>'Nest TÜV', '')) AS hu,
                    COALESCE(NULLIF(raw_payload->>'SP', ''), NULLIF(raw_payload->>'Versicherung bis', ''), NULLIF(raw_payload->>'Insurance', '')) AS sp,
                    COALESCE(NULLIF(raw_payload->>'57B', ''), '') AS b_57
                FROM trucks
                WHERE (%s OR is_active IS TRUE)
                ORDER BY external_id
                """,
                (include_inactive,),
            )
            for truck_id, lkw_id, lkw_number, hu, sp, b_57 in cur.fetchall():
                for field_name, raw_value in (("HU", hu), ("SP", sp), ("57B", b_57)):
                    due_month = parse_due_month(raw_value)
                    if due_month is None:
                        continue
                    result.append(
                        LkwDeadline(
                            truck_db_id=int(truck_id),
                            lkw_id=str(lkw_id or "").strip(),
                            lkw_number=str(lkw_number or "").strip(),
                            field_name=field_name,
                            due_month=due_month,
                            notify_date=previous_month_start(due_month),
                        )
                    )
    return result


def due_for_notification(items: list[LkwDeadline], today: date) -> list[LkwDeadline]:
    return sorted(
        [item for item in items if item.notify_date == today],
        key=lambda item: (item.due_month, item.field_name, item.lkw_id, item.lkw_number),
    )


def nearest_upcoming(items: list[LkwDeadline], today: date) -> list[LkwDeadline]:
    upcoming = [item for item in items if item.notify_date >= today]
    if not upcoming:
        return []
    next_date = min(item.notify_date for item in upcoming)
    return sorted(
        [item for item in upcoming if item.notify_date == next_date],
        key=lambda item: (item.due_month, item.field_name, item.lkw_id, item.lkw_number),
    )


def build_message(items: list[LkwDeadline], today: date, *, test: bool = False) -> str:
    prefix = "TEST\n" if test else ""
    lines = [
        f"{prefix}LKW Termine - Erinnerung {_format_date(today)}",
        "",
    ]
    for idx, item in enumerate(items, start=1):
        truck_ref = item.lkw_number or item.lkw_id or "-"
        if item.lkw_id and item.lkw_number and item.lkw_id != item.lkw_number:
            truck_ref = f"{item.lkw_number} ({item.lkw_id})"
        lines.extend(
            [
                f"{idx}. {truck_ref}",
                f"Termin: {item.field_name}",
                f"Gueltig bis: {_format_month(item.due_month)}",
                f"Aktion: neuen {item.field_name} bis {_format_month(item.due_month)} machen",
                "",
            ]
        )
    return "\n".join(lines).strip()


def _state_key(today: date, items: list[LkwDeadline]) -> str:
    item_key = ",".join(
        f"{item.truck_db_id}:{item.field_name}:{item.due_month.isoformat()}" for item in items
    )
    return f"{today.isoformat()}:{item_key}"


def notify(items: list[LkwDeadline], today: date, *, test: bool = False) -> tuple[bool, bool]:
    message = build_message(items, today, test=test)
    subject_prefix = "TEST " if test else ""
    subject = f"{subject_prefix}LKW Termine Erinnerung {_format_date(today)}"
    _send_telegram(message)
    email_sent = _send_email(subject, message)
    return True, email_sent


def main() -> int:
    load_dotenv(BASE_DIR / ".env", override=True)
    _rotate_log()

    database_url = (os.getenv("DATABASE_URL") or "").strip()
    if not database_url:
        _log("FAILED: DATABASE_URL is empty")
        return 2

    today = datetime.now(_schedule_timezone()).date()
    state_path = _state_file_path()
    state = _load_state(state_path)

    all_items = _fetch_deadlines(database_url)
    items = due_for_notification(all_items, today)
    key = _state_key(today, items)
    already_sent = bool(items) and state.get("last_sent_key") == key
    _log(
        "lkw_deadline_check: "
        f"date={today.isoformat()} due_count={len(items)} all_count={len(all_items)} already_sent={already_sent}"
    )

    if items and not already_sent:
        _, email_sent = notify(items, today)
        state["last_sent_key"] = key
        state["last_sent_at"] = int(time.time())
        state["last_sent_count"] = len(items)
        state["last_email_sent"] = email_sent
        _save_state(state_path, state)
        _log(f"lkw_deadline_notification_sent=true email_sent={email_sent}")
        return 0

    if (not items) and _env_bool("LKW_DEADLINE_NOTIFY_EMPTY", False):
        empty_key = f"{today.isoformat()}:empty"
        if state.get("last_sent_key") != empty_key:
            _, email_sent = notify([], today)
            state["last_sent_key"] = empty_key
            state["last_sent_at"] = int(time.time())
            state["last_sent_count"] = 0
            state["last_email_sent"] = email_sent
            _save_state(state_path, state)
            _log(f"lkw_deadline_empty_notification_sent=true email_sent={email_sent}")

    state["last_checked_at"] = int(time.time())
    state["last_checked_date"] = today.isoformat()
    state["last_checked_count"] = len(items)
    _save_state(state_path, state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
