"""
Run full ETL pipeline:
1) XLSM master import
2) XLSB plan import

Logs to etl_runner.log and optionally notifies admin via Telegram on failure.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from urllib import parse, request

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
LOG_FILE = BASE_DIR / "etl_runner.log"
LOCK_FILE = Path(os.environ.get("TEMP", r"C:\Windows\Temp")) / "lkw_etl_pipeline.lock"


def env_int(name: str, default: int, minimum: int = 1) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return max(minimum, default)
    try:
        return max(minimum, int(raw))
    except ValueError:
        return max(minimum, default)


LOCK_STALE_SEC = env_int("ETL_PIPELINE_LOCK_STALE_SEC", 2 * 3600, minimum=15 * 60)
STEP_TIMEOUTS_SEC = {
    "xlsm": env_int("ETL_STEP_TIMEOUT_XLSM_SEC", 45 * 60, minimum=5 * 60),
    "xlsb": env_int("ETL_STEP_TIMEOUT_XLSB_SEC", 20 * 60, minimum=5 * 60),
    "sim_cards": env_int("ETL_STEP_TIMEOUT_SIM_CARDS_SEC", 10 * 60, minimum=2 * 60),
}


def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}\n"
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line)
    print(msg)


def notify_admin(text: str) -> None:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    admin_chat_id = (os.getenv("ADMIN_CHAT_ID") or "").strip()
    if not token or not admin_chat_id:
        return

    try:
        payload = parse.urlencode({"chat_id": admin_chat_id, "text": text}).encode("utf-8")
        req = request.Request(
            url=f"https://api.telegram.org/bot{token}/sendMessage",
            data=payload,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        with request.urlopen(req, timeout=20) as resp:
            resp.read()
    except Exception as exc:
        log(f"WARN: failed to notify admin: {exc}")


def run_step(name: str, script: str, required: bool = True) -> bool:
    py = BASE_DIR / ".venv" / "Scripts" / "python.exe"
    cmd = [str(py), str(BASE_DIR / script)]
    log(f"STEP START: {name} -> {' '.join(cmd)}")
    timeout_sec = STEP_TIMEOUTS_SEC.get(name, env_int("ETL_STEP_TIMEOUT_DEFAULT_SEC", 30 * 60, minimum=5 * 60))
    try:
        cp = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(BASE_DIR),
            timeout=timeout_sec,
        )
    except subprocess.TimeoutExpired as exc:
        stdout = (exc.stdout or "").strip()
        stderr = (exc.stderr or "").strip()
        if stdout:
            log(f"{name} stdout before timeout: {stdout}")
        if stderr:
            log(f"{name} stderr before timeout: {stderr}")
        raise RuntimeError(f"{name} timed out after {timeout_sec} seconds") from exc
    if cp.stdout.strip():
        log(f"{name} stdout: {cp.stdout.strip()}")
    if cp.stderr.strip():
        log(f"{name} stderr: {cp.stderr.strip()}")
    if cp.returncode != 0:
        if required:
            raise RuntimeError(f"{name} failed with exit code {cp.returncode}")
        log(f"STEP WARN: {name} failed with exit code {cp.returncode} (optional step)")
        return False
    log(f"STEP OK: {name}")
    return True


def rotate_log_if_needed(max_bytes: int = 512_000, keep_lines: int = 1200) -> None:
    if not LOG_FILE.exists():
        return
    if LOG_FILE.stat().st_size <= max_bytes:
        return
    with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()[-keep_lines:]
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        f.writelines(lines)


def is_process_running(pid: int) -> bool:
    if pid <= 0:
        return False
    if pid == os.getpid():
        return True
    if os.name == "nt":
        try:
            cp = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
        except Exception:
            return True
        if cp.returncode != 0:
            return True
        out = (cp.stdout or "").strip()
        return out.startswith('"')
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def _to_int(value: object) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def acquire_pipeline_lock() -> bool:
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    now_ts = int(datetime.now().timestamp())
    payload = {"pid": os.getpid(), "started_at": now_ts}

    for _ in range(2):
        try:
            fd = os.open(str(LOCK_FILE), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False)
            return True
        except FileExistsError:
            try:
                info = json.loads(LOCK_FILE.read_text(encoding="utf-8", errors="ignore"))
            except Exception:
                info = {}
            pid = _to_int(info.get("pid"))
            started_at = _to_int(info.get("started_at"))
            age_sec = max(0, now_ts - started_at) if started_at else 0

            process_active = is_process_running(pid) if pid else False
            stale_reason = ""
            if not info:
                stale_reason = "invalid lock payload"
            elif pid and process_active:
                log(f"ETL PIPELINE SKIP: active lock pid={pid} ({LOCK_FILE})")
                return False
            elif started_at and age_sec <= LOCK_STALE_SEC:
                log(f"ETL PIPELINE SKIP: recent lock pid={pid} age_sec={age_sec} ({LOCK_FILE})")
                return False
            elif pid and not process_active:
                stale_reason = f"stale pid={pid} age_sec={age_sec}"
            elif started_at and age_sec > LOCK_STALE_SEC:
                stale_reason = f"stale age_sec={age_sec}"

            if stale_reason:
                log(f"ETL PIPELINE REMOVE STALE LOCK: {stale_reason} ({LOCK_FILE})")
                try:
                    LOCK_FILE.unlink(missing_ok=True)
                except Exception:
                    pass
                continue
            log(f"ETL PIPELINE SKIP: lock exists ({LOCK_FILE})")
            return False
    return False


def release_pipeline_lock() -> None:
    try:
        LOCK_FILE.unlink(missing_ok=True)
    except Exception:
        pass


def main() -> int:
    load_dotenv(BASE_DIR / ".env", override=True)
    rotate_log_if_needed()
    if not acquire_pipeline_lock():
        return 0
    started = datetime.now()
    log("ETL PIPELINE START")

    summary: dict[str, str] = {"started_at": started.isoformat()}
    try:
        run_step("xlsm", "etl_xlsm_to_postgres.py")
        run_step("xlsb", "etl_xlsb_to_postgres.py")
        run_step("sim_cards", "etl_sim_cards_to_postgres.py", required=False)
        finished = datetime.now()
        summary["status"] = "success"
        summary["finished_at"] = finished.isoformat()
        summary["duration_sec"] = str(int((finished - started).total_seconds()))
        log(f"ETL PIPELINE SUCCESS: {json.dumps(summary, ensure_ascii=False)}")
        return 0
    except Exception as exc:
        finished = datetime.now()
        summary["status"] = "failed"
        summary["finished_at"] = finished.isoformat()
        summary["duration_sec"] = str(int((finished - started).total_seconds()))
        summary["error"] = str(exc)
        log(f"ETL PIPELINE FAILED: {json.dumps(summary, ensure_ascii=False)}")
        notify_admin(f"⚠️ ETL failed: {exc}")
        return 1
    finally:
        release_pipeline_lock()


if __name__ == "__main__":
    raise SystemExit(main())
