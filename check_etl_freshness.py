"""
ETL schedule monitor.

Checks successful ETL imports in etl_log and notifies the admin if the hourly
weekday schedule is not being met. Designed for Windows Task Scheduler.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from datetime import datetime, time as dtime, timezone
from pathlib import Path
from urllib import parse, request
from zoneinfo import ZoneInfo

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
LOG_FILE = BASE_DIR / "etl_freshness.log"
SOURCE_SPECS = {
    "xlsm_lkw_fahrer_data": "LKW_Fahrer_Data.xlsm",
    "xlsb_fahrer_plan": "LKW_Fahrer_Plan.xlsb",
}


def _log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}\n"
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line)
    print(msg)


def _rotate_log(max_bytes: int = 256_000, keep_lines: int = 800) -> None:
    if not LOG_FILE.exists():
        return
    if LOG_FILE.stat().st_size <= max_bytes:
        return
    with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()[-keep_lines:]
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        f.writelines(lines)


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return max(minimum, default)
    try:
        return max(minimum, int(raw))
    except ValueError:
        return max(minimum, default)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    return raw not in {"0", "false", "no", "off"}


def _state_file_path() -> Path:
    p = os.getenv("ETL_STALE_STATE_FILE", "").strip()
    if p:
        return Path(os.path.expandvars(p))
    return Path(os.environ.get("TEMP", r"C:\Windows\Temp")) / "lkw_etl_stale_state.json"


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


def _send_telegram(text: str) -> None:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    admin_chat_id = (os.getenv("ADMIN_CHAT_ID") or "745125435").strip()
    if not token or not admin_chat_id:
        _log("WARN: TELEGRAM_BOT_TOKEN is empty, skip notification")
        return
    payload = parse.urlencode({"chat_id": admin_chat_id, "text": text}).encode("utf-8")
    req = request.Request(
        url=f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with request.urlopen(req, timeout=20) as resp:
        resp.read()


def _remediation_task_name() -> str:
    return (os.getenv("ETL_REMEDIATION_TASK_NAME") or "LKW_Report_Bot_ETL_DayHourly").strip()


def _remediation_cooldown_seconds() -> int:
    return _env_int("ETL_REMEDIATION_COOLDOWN_MIN", 60, minimum=1) * 60


def _maybe_start_etl_remediation(state: dict, stale_key: str) -> bool:
    """Start the scheduled ETL task when freshness is stale, throttled by state."""
    if not _env_bool("ETL_AUTO_REMEDIATE", True):
        _log("etl_remediation: disabled")
        return False

    now_ts = int(time.time())
    last_started_at = int(state.get("last_remediation_at") or 0)
    last_key = state.get("last_remediation_key")
    if last_key == stale_key and (now_ts - last_started_at) < _remediation_cooldown_seconds():
        _log("etl_remediation: skipped=cooldown")
        return False

    task_name = _remediation_task_name()
    cmd = ["cmd.exe", "/c", "schtasks", "/Run", "/TN", task_name]
    state["last_remediation_at"] = now_ts
    state["last_remediation_key"] = stale_key
    state["last_remediation_task"] = task_name
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=False)
    except Exception as exc:
        state["last_remediation_result"] = f"exception: {exc}"
        _log(f"etl_remediation: started=false task={task_name} error={exc}")
        return False

    state["last_remediation_result"] = str(result.returncode)
    if result.returncode == 0:
        _log(f"etl_remediation: started=true task={task_name}")
        return True

    stderr = (result.stderr or result.stdout or "").strip().replace("\r", " ").replace("\n", " ")
    _log(f"etl_remediation: started=false task={task_name} returncode={result.returncode} output={stderr}")
    return False


def _schedule_timezone() -> ZoneInfo:
    raw = (os.getenv("ETL_SCHEDULE_TIMEZONE") or "Europe/Berlin").strip()
    try:
        return ZoneInfo(raw)
    except Exception:
        return ZoneInfo("Europe/Berlin")


def _parse_hhmm(value: str, default: dtime) -> dtime:
    try:
        hh, mm = value.split(":", 1)
        return dtime(int(hh), int(mm))
    except Exception:
        return default


def _weekday_schedule_enabled(now_local: datetime) -> bool:
    """True when the weekday hourly ETL SLA should be enforced."""
    if now_local.weekday() >= 5:
        return False

    start_time = _parse_hhmm((os.getenv("ETL_SCHEDULE_START") or "07:00").strip(), dtime(7, 0))
    end_time = _parse_hhmm((os.getenv("ETL_SCHEDULE_END") or "18:00").strip(), dtime(18, 0))
    morning_grace_min = _env_int("ETL_MORNING_GRACE_MIN", 90, minimum=0)
    end_grace_min = _env_int("ETL_END_GRACE_MIN", 30, minimum=0)

    start_dt = now_local.replace(hour=start_time.hour, minute=start_time.minute, second=0, microsecond=0)
    end_dt = now_local.replace(hour=end_time.hour, minute=end_time.minute, second=0, microsecond=0)
    now_ts = now_local.timestamp()
    return (start_dt.timestamp() + morning_grace_min * 60) <= now_ts <= (
        end_dt.timestamp() + end_grace_min * 60
    )


def _max_allowed_age_seconds() -> int:
    interval_min = _env_int("ETL_EXPECTED_INTERVAL_MIN", 60, minimum=1)
    grace_min = _env_int("ETL_EXPECTED_GRACE_MIN", 30, minimum=0)
    return (interval_min + grace_min) * 60


def _get_last_success_by_source() -> dict[str, datetime | None]:
    db_url = (os.getenv("DATABASE_URL") or "").strip()
    if not db_url:
        raise RuntimeError("DATABASE_URL is empty")

    import psycopg  # project dependency

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT ON (source_name)
                    source_name,
                    COALESCE(finished_at, started_at) AS import_ts
                FROM etl_log
                WHERE status = 'success'
                  AND source_name = ANY(%s)
                ORDER BY source_name, COALESCE(finished_at, started_at) DESC
                """,
                (list(SOURCE_SPECS.keys()),),
            )
            rows = cur.fetchall()

    result: dict[str, datetime | None] = {source: None for source in SOURCE_SPECS}
    for source_name, import_ts in rows:
        if source_name not in result or import_ts is None:
            continue
        if getattr(import_ts, "tzinfo", None) is None:
            import_ts = import_ts.replace(tzinfo=timezone.utc)
        result[source_name] = import_ts.astimezone(timezone.utc)
    return result


def _newest_success(last_success_by_source: dict[str, datetime | None]) -> tuple[str | None, datetime | None]:
    items = [(source, ts) for source, ts in last_success_by_source.items() if ts is not None]
    if not items:
        return None, None
    return max(items, key=lambda item: item[1])


def evaluate_etl_health(
    last_success_by_source: dict[str, datetime | None],
    now_utc: datetime,
    now_local: datetime,
) -> tuple[bool, list[dict]]:
    if not _weekday_schedule_enabled(now_local):
        return False, []

    max_age_sec = _max_allowed_age_seconds()
    stale_sources = []
    for source_name, file_name in SOURCE_SPECS.items():
        last_import_at = last_success_by_source.get(source_name)
        if last_import_at is None:
            stale_sources.append({
                "source_name": source_name,
                "file_name": file_name,
                "last_import_at": None,
                "age_sec": None,
                "threshold_sec": max_age_sec,
            })
            continue
        age_sec = max(0, int((now_utc - last_import_at).total_seconds()))
        if age_sec > max_age_sec:
            stale_sources.append({
                "source_name": source_name,
                "file_name": file_name,
                "last_import_at": last_import_at,
                "age_sec": age_sec,
                "threshold_sec": max_age_sec,
            })
    return bool(stale_sources), stale_sources


def _stale_key(stale_sources: list[dict]) -> str:
    return "|".join(
        f"{item['source_name']}:{int(item['last_import_at'].timestamp()) if item['last_import_at'] else 'none'}"
        for item in stale_sources
    ) or "healthy"


def _alert_message(stale_sources: list[dict], now_local: datetime) -> str:
    lines = [
        "ETL schedule alert",
        "Rule: weekdays, every hour, 07:00-18:00 Europe/Berlin",
        f"Checked at: {now_local.isoformat()}",
    ]
    for item in stale_sources:
        if item["age_sec"] is None:
            lines.append(f"- {item['file_name']}: last=none")
        else:
            lines.append(
                f"- {item['file_name']}: "
                f"last={item['last_import_at'].isoformat()}, "
                f"age_hours={item['age_sec'] / 3600.0:.2f}, "
                f"threshold_min={item['threshold_sec'] // 60}"
            )
    return "\n".join(lines)


def main() -> int:
    load_dotenv(BASE_DIR / ".env", override=True)
    _rotate_log()

    state_path = _state_file_path()
    state = _load_state(state_path)

    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(_schedule_timezone())
    last_success_by_source = _get_last_success_by_source()
    stale, stale_sources = evaluate_etl_health(last_success_by_source, now_utc, now_local)
    source_name, last_import_at = _newest_success(last_success_by_source)
    stale_key = _stale_key(stale_sources)

    prev_stale_key = state.get("stale_key")
    already_alerted = bool(state.get("alert_sent")) and prev_stale_key == stale_key

    newest_age_sec = None
    if last_import_at is not None:
        newest_age_sec = max(0, int((now_utc - last_import_at).total_seconds()))
    _log(
        "freshness_check: "
        f"scheduled_window={_weekday_schedule_enabled(now_local)} "
        f"stale={stale} age_sec={newest_age_sec} threshold_sec={_max_allowed_age_seconds()} "
        f"last_import_at={last_import_at.isoformat() if last_import_at else None} "
        f"source={source_name} stale_sources={','.join(item['source_name'] for item in stale_sources)}"
    )

    remediation_started = False
    if stale:
        remediation_started = _maybe_start_etl_remediation(state, stale_key)

    if stale and not already_alerted:
        _send_telegram(_alert_message(stale_sources, now_local))
        state["alert_sent"] = True
        state["stale_key"] = stale_key
        state["last_alert_at"] = int(time.time())
        state["last_alert_remediation_started"] = remediation_started
        _save_state(state_path, state)
        _log("alert_sent=true")
        return 0

    if (not stale) and state.get("alert_sent"):
        msg = (
            "ETL recovered\n"
            f"Latest successful import: {last_import_at.isoformat() if last_import_at else 'unknown'}\n"
            f"Source: {source_name or 'unknown'}"
        )
        _send_telegram(msg)
        state["alert_sent"] = False
        state["stale_key"] = None
        state["last_recover_at"] = int(time.time())
        _save_state(state_path, state)
        _log("recovery_sent=true")
        return 0

    state["alert_sent"] = bool(state.get("alert_sent")) and stale
    state["stale_key"] = stale_key if stale else None
    state["last_checked_at"] = int(time.time())
    _save_state(state_path, state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
