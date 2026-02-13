import os
import shutil
import sys
from pathlib import Path

from dotenv import load_dotenv

from scheduler import parse_cron

MIN_DISK_FREE_MB = 500


def _print(status: str, message: str) -> None:
    print(f"[{status}] {message}")


def _ok(message: str) -> None:
    _print("OK", message)


def _warn(message: str) -> None:
    _print("WARN", message)


def _fail(message: str) -> None:
    _print("FAIL", message)


def main() -> int:
    load_dotenv(override=True)
    failed = False

    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    if token:
        _ok("TELEGRAM_BOT_TOKEN configured")
    else:
        _fail("TELEGRAM_BOT_TOKEN is empty")
        failed = True

    wl = (os.getenv("WHITELIST_USER_IDS") or "").strip()
    if wl:
        _ok("WHITELIST_USER_IDS configured")
    else:
        _warn("WHITELIST_USER_IDS is empty")

    excel_path = (os.getenv("EXCEL_FILE_PATH") or "").strip()
    if not excel_path:
        _fail("EXCEL_FILE_PATH is empty")
        failed = True
    else:
        p = Path(excel_path)
        if p.exists():
            _ok(f"EXCEL_FILE_PATH exists: {p}")
        else:
            _fail(f"EXCEL_FILE_PATH not found: {p}")
            failed = True

    webapp_url = (os.getenv("WEBAPP_URL") or "").strip()
    if not webapp_url:
        _warn("WEBAPP_URL is empty (Open App button will not work)")
    else:
        if webapp_url.lower().startswith("https://"):
            _ok(f"WEBAPP_URL uses HTTPS: {webapp_url}")
        else:
            _fail(f"WEBAPP_URL must be HTTPS: {webapp_url}")
            failed = True

        if "trycloudflare.com" in webapp_url.lower():
            _warn("WEBAPP_URL is trycloudflare (temporary). Use stable domain for production.")

    schedule_enabled = (os.getenv("SCHEDULE_ENABLED") or "false").lower() in ("1", "true", "yes")
    cron = (os.getenv("SCHEDULE_CRON") or "").strip()
    tz = (os.getenv("SCHEDULE_TIMEZONE") or "").strip()
    if schedule_enabled:
        if not cron:
            _fail("SCHEDULE_ENABLED=true but SCHEDULE_CRON is empty")
            failed = True
        else:
            try:
                parse_cron(cron)
                _ok(f"SCHEDULE_CRON valid: {cron}")
            except Exception as e:
                _fail(f"SCHEDULE_CRON invalid: {e}")
                failed = True

        if tz:
            _ok(f"SCHEDULE_TIMEZONE set: {tz}")
        else:
            _warn("SCHEDULE_TIMEZONE empty, fallback may be used")

        schedule_users = (os.getenv("SCHEDULE_USER_IDS") or "").strip()
        if schedule_users:
            _ok("SCHEDULE_USER_IDS configured")
        elif wl:
            _warn("SCHEDULE_USER_IDS empty, fallback to WHITELIST_USER_IDS")
        else:
            _fail("No recipients configured for scheduler (SCHEDULE_USER_IDS and WHITELIST_USER_IDS empty)")
            failed = True
    else:
        _warn("Scheduler disabled (SCHEDULE_ENABLED != true)")

    port_raw = (os.getenv("WEBAPP_PORT") or "8443").strip()
    try:
        port = int(port_raw)
        if 1 <= port <= 65535:
            _ok(f"WEBAPP_PORT valid: {port}")
        else:
            _fail(f"WEBAPP_PORT out of range: {port}")
            failed = True
    except ValueError:
        _fail(f"WEBAPP_PORT is not an integer: {port_raw}")
        failed = True

    hb_raw = (os.getenv("HEARTBEAT_INTERVAL_SEC") or "30").strip()
    try:
        hb = int(hb_raw)
        if hb < 5:
            _warn(f"HEARTBEAT_INTERVAL_SEC too low ({hb}), recommended >= 5")
        else:
            _ok(f"HEARTBEAT_INTERVAL_SEC valid: {hb}")
    except ValueError:
        _fail(f"HEARTBEAT_INTERVAL_SEC is not an integer: {hb_raw}")
        failed = True

    # Disk space checks
    for label, path in [("TEMP", os.environ.get("TEMP", "")), ("Working dir", os.path.dirname(__file__))]:
        if path:
            try:
                usage = shutil.disk_usage(path)
                free_mb = usage.free // (1024 * 1024)
                if free_mb < MIN_DISK_FREE_MB:
                    _warn(f"{label} drive low on space: {free_mb} MB free (< {MIN_DISK_FREE_MB} MB)")
                else:
                    _ok(f"{label} drive space OK: {free_mb} MB free")
            except Exception as e:
                _warn(f"Could not check disk space for {label}: {e}")

    if failed:
        _fail("Preflight check finished with errors")
        return 1

    _ok("Preflight check passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
