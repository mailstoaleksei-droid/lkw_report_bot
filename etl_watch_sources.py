"""
ETL source watcher (polling mode).

Run periodically from Task Scheduler:
- Detects changes in source Excel files by (mtime, size)
- Waits until changes are stable for ETL_WATCH_SETTLE_SECONDS
- Triggers run_etl_pipeline_task.cmd once per change set
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
LOG_FILE = BASE_DIR / "etl_watch.log"
DEFAULT_SIM_CARDS_FILE_PATH = Path(
    r"C:\Users\Aleksei Samosvat\Groo GmbH\Communication site - Documents\Groo Cargo Logistic\GC_IT\GC_Sim-Karten_LOG_IN\LOG_INs 2.xlsx"
)


def _log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}\n"
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line)
    print(msg)


def _rotate_log(max_bytes: int = 256_000, keep_lines: int = 900) -> None:
    if not LOG_FILE.exists():
        return
    if LOG_FILE.stat().st_size <= max_bytes:
        return
    with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()[-keep_lines:]
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        f.writelines(lines)


def _env_path(name: str, default: str = "") -> Path | None:
    raw = (os.getenv(name) or default).strip()
    if not raw:
        return None
    return Path(os.path.expandvars(raw.strip().strip("\"")))


def _state_path() -> Path:
    path = _env_path("ETL_WATCH_STATE_FILE", r"%TEMP%\lkw_etl_watch_state.json")
    if path is None:
        raise RuntimeError("ETL_WATCH_STATE_FILE could not be resolved")
    return path


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


def _to_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        return default


def _resolve_sources() -> dict[str, Path]:
    xlsm_path = _env_path("EXCEL_FILE_PATH")
    if xlsm_path is None:
        raise RuntimeError("EXCEL_FILE_PATH is empty")

    xlsb_path = _env_path("XLSB_FILE_PATH")
    if xlsb_path is None:
        xlsb_path = xlsm_path.with_name("LKW_Fahrer_Plan.xlsb")

    sim_cards_path = _env_path("SIM_CARDS_FILE_PATH", str(DEFAULT_SIM_CARDS_FILE_PATH))
    if sim_cards_path is None:
        raise RuntimeError("SIM_CARDS_FILE_PATH could not be resolved")

    return {
        "LKW_Fahrer_Data.xlsm": xlsm_path,
        "LKW_Fahrer_Plan.xlsb": xlsb_path,
        "LOG_INs 2.xlsx": sim_cards_path,
    }


def _collect_signature(sources: dict[str, Path]) -> dict:
    files: dict[str, dict[str, int | str | bool]] = {}
    all_exist = True
    for logical_name, path in sources.items():
        exists = path.exists()
        if not exists:
            all_exist = False
            files[logical_name] = {
                "path": str(path),
                "exists": False,
                "size": 0,
                "mtime_ns": 0,
            }
            continue

        st = path.stat()
        files[logical_name] = {
            "path": str(path),
            "exists": True,
            "size": int(st.st_size),
            "mtime_ns": int(st.st_mtime_ns),
        }

    canonical = "|".join(
        f"{name}:{meta['path']}:{meta['exists']}:{meta['size']}:{meta['mtime_ns']}"
        for name, meta in sorted(files.items(), key=lambda x: x[0])
    )
    return {
        "all_exist": all_exist,
        "files": files,
        "hash": canonical,
    }


def _run_pipeline() -> tuple[int, str, str]:
    task_cmd = BASE_DIR / "run_etl_pipeline_task.cmd"
    if not task_cmd.exists():
        raise FileNotFoundError(f"Task command not found: {task_cmd}")

    cp = subprocess.run(
        ["cmd", "/c", str(task_cmd)],
        cwd=str(BASE_DIR),
        capture_output=True,
        text=True,
    )
    return cp.returncode, (cp.stdout or "").strip(), (cp.stderr or "").strip()


def main() -> int:
    load_dotenv(BASE_DIR / ".env", override=True)
    _rotate_log()

    if str(os.getenv("ETL_WATCH_ENABLED", "true")).strip().lower() in {"0", "false", "no", "off"}:
        _log("watcher_disabled=true (ETL_WATCH_ENABLED=false)")
        return 0

    settle_sec = _to_int("ETL_WATCH_SETTLE_SECONDS", 90)
    min_interval_sec = _to_int("ETL_WATCH_MIN_INTERVAL_SECONDS", 600)
    state_path = _state_path()
    state = _load_state(state_path)
    now = int(time.time())

    sources = _resolve_sources()
    signature = _collect_signature(sources)
    current_hash = str(signature["hash"])

    last_seen_hash = str(state.get("last_seen_hash") or "")
    last_triggered_hash = str(state.get("last_triggered_hash") or "")
    last_change_at = int(state.get("last_change_at") or 0)
    last_trigger_at = int(state.get("last_trigger_at") or 0)

    if not signature["all_exist"]:
        _log("watcher_sources_missing=true; skip trigger")
        state["last_seen_hash"] = current_hash
        state["files"] = signature["files"]
        state["last_checked_at"] = now
        _save_state(state_path, state)
        return 0

    if not last_seen_hash:
        state["last_seen_hash"] = current_hash
        state["last_triggered_hash"] = current_hash
        state["last_change_at"] = 0
        state["last_checked_at"] = now
        state["files"] = signature["files"]
        _save_state(state_path, state)
        _log("watcher_bootstrap_done=true")
        return 0

    if current_hash != last_seen_hash:
        state["last_seen_hash"] = current_hash
        state["last_change_at"] = now
        state["last_checked_at"] = now
        state["files"] = signature["files"]
        _save_state(state_path, state)
        _log(f"change_detected=true settle_wait_sec={settle_sec}")
        return 0

    # No new delta this run. If seen hash is already processed -> nothing to do.
    if current_hash == last_triggered_hash:
        state["last_checked_at"] = now
        state["files"] = signature["files"]
        _save_state(state_path, state)
        return 0

    age_sec = max(0, now - last_change_at) if last_change_at else 0
    if age_sec < settle_sec:
        _log(f"change_pending=true age_sec={age_sec} settle_sec={settle_sec}")
        state["last_checked_at"] = now
        state["files"] = signature["files"]
        _save_state(state_path, state)
        return 0

    if last_trigger_at and (now - last_trigger_at) < min_interval_sec:
        wait_left = min_interval_sec - (now - last_trigger_at)
        _log(f"trigger_throttled=true wait_left_sec={wait_left}")
        state["last_checked_at"] = now
        state["files"] = signature["files"]
        _save_state(state_path, state)
        return 0

    _log("trigger_etl=true reason=source_changed")
    rc, out, err = _run_pipeline()
    if out:
        _log(f"etl_stdout={out[:1000]}")
    if err:
        _log(f"etl_stderr={err[:1000]}")

    state["last_checked_at"] = now
    state["files"] = signature["files"]
    state["last_trigger_at"] = now
    state["last_run_rc"] = rc

    if rc == 0:
        state["last_triggered_hash"] = current_hash
        state["last_change_at"] = 0
        _save_state(state_path, state)
        _log("trigger_etl_ok=true")
        return 0

    _save_state(state_path, state)
    _log("trigger_etl_ok=false")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
