"""
Lightweight aiohttp web server for Telegram Mini App hosting.

Endpoints:
  GET /            — serves miniapp/index.html
  GET /healthz     — lightweight health endpoint
  GET /api/reports — returns JSON list of available report types + params
  GET /api/meta    — returns app metadata (schedule/timezone/etc.)
  POST /api/generate — accepts report request from Mini App, generates & sends PDF
"""

import os
import asyncio
import hashlib
import hmac
import json
import logging
import pathlib
import subprocess
import sys
import time
from datetime import datetime, timezone
from typing import Callable
from urllib.parse import parse_qsl

from aiohttp import web

from report_config import get_all_reports_api, REPORT_TYPES

logger = logging.getLogger("lkw_report_bot.web")

BASE_DIR = os.path.dirname(__file__)
MINIAPP_DIR = os.path.join(BASE_DIR, "miniapp")

# These are set by init_web_app() from bot.py
_bot = None
_excel_lock = None
_run_report_fn = None
_whitelist_fn: Callable[[], set[int]] = lambda: set()
_bot_token: str = ""

# Rate limiting for /api/generate
_api_cooldowns: dict[int, float] = {}
_API_COOLDOWN_SEC = 5
_etl_trigger_cooldowns: dict[int, float] = {}
_ETL_TRIGGER_COOLDOWN_SEC = 30

# initData auth_date must not be older than this (seconds)
_INIT_DATA_MAX_AGE_SEC = 300  # 5 minutes


def init_web_app(bot, excel_lock, run_report_fn, whitelist_fn: Callable[[], set[int]], bot_token: str):
    """Initialize web server with bot dependencies. Called from bot.py before start."""
    global _bot, _excel_lock, _run_report_fn, _whitelist_fn, _bot_token
    _bot = bot
    _excel_lock = excel_lock
    _run_report_fn = run_report_fn
    _whitelist_fn = whitelist_fn
    _bot_token = bot_token


def _validate_init_data(init_data_raw: str) -> dict | None:
    """Validate Telegram WebApp initData using HMAC-SHA256.

    Returns parsed data dict if valid, None otherwise.
    See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    if not init_data_raw or not _bot_token:
        return None

    try:
        params = dict(parse_qsl(init_data_raw, keep_blank_values=True))
        received_hash = params.pop("hash", "")
        if not received_hash:
            return None

        # Build data-check-string: sorted key=value pairs joined by \n
        data_check = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))

        # secret_key = HMAC-SHA256("WebAppData", bot_token)
        secret_key = hmac.new(b"WebAppData", _bot_token.encode(), hashlib.sha256).digest()
        # calculated_hash = HMAC-SHA256(secret_key, data_check_string)
        calculated_hash = hmac.new(secret_key, data_check.encode(), hashlib.sha256).hexdigest()

        if not hmac.compare_digest(calculated_hash, received_hash):
            return None

        # Reject expired initData (replay attack prevention)
        try:
            auth_ts = int(params.get("auth_date", "0"))
            if auth_ts > 0 and (time.time() - auth_ts) > _INIT_DATA_MAX_AGE_SEC:
                logger.warning("initData expired: auth_date=%s, age=%ds", auth_ts, int(time.time() - auth_ts))
                return None
        except (ValueError, TypeError):
            pass  # If auth_date is missing/unparseable, skip age check (HMAC is still valid)

        return params
    except Exception:
        logger.exception("initData validation error")
        return None


def _extract_user_id(validated_data: dict) -> int | None:
    """Extract user ID from validated initData."""
    user_str = validated_data.get("user", "")
    if not user_str:
        return None
    try:
        user = json.loads(user_str)
        return int(user.get("id", 0)) or None
    except Exception:
        return None


async def handle_index(request: web.Request) -> web.Response:
    path = os.path.join(MINIAPP_DIR, "index.html")
    return web.FileResponse(path)


async def handle_api_reports(request: web.Request) -> web.Response:
    data = get_all_reports_api()
    return web.json_response(data)


def _get_etl_meta() -> dict:
    """
    Read ETL freshness metadata from PostgreSQL (etl_log).
    Returns a safe dict even if DB is unavailable.
    """
    stale_after_hours_raw = os.getenv("ETL_STALE_AFTER_HOURS", "4").strip() or "4"
    try:
        stale_after_hours = max(1, int(stale_after_hours_raw))
    except ValueError:
        stale_after_hours = 4
    stale_after_sec = stale_after_hours * 3600

    meta = {
        "last_import_at": None,
        "age_sec": None,
        "is_stale": True,
        "stale_after_hours": stale_after_hours,
        "source_name": None,
    }

    db_url = (os.getenv("DATABASE_URL") or "").strip()
    if not db_url:
        return meta

    try:
        import psycopg  # type: ignore

        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        source_name,
                        COALESCE(finished_at, started_at) AS import_ts
                    FROM etl_log
                    WHERE status = 'success'
                    ORDER BY COALESCE(finished_at, started_at) DESC
                    LIMIT 1
                    """
                )
                row = cur.fetchone()
                if not row:
                    return meta

                source_name, import_ts = row
                if import_ts is None:
                    return meta

                if getattr(import_ts, "tzinfo", None) is None:
                    import_ts = import_ts.replace(tzinfo=timezone.utc)
                import_utc = import_ts.astimezone(timezone.utc)
                now_utc = datetime.now(timezone.utc)
                age_sec = max(0, int((now_utc - import_utc).total_seconds()))

                meta["last_import_at"] = import_utc.isoformat()
                meta["age_sec"] = age_sec
                meta["is_stale"] = age_sec > stale_after_sec
                meta["source_name"] = source_name
                return meta
    except Exception:
        logger.exception("Failed to load ETL meta from DB")
        return meta


async def handle_api_meta(request: web.Request) -> web.Response:
    """Return metadata for Mini App UI."""
    schedule_enabled = os.getenv("SCHEDULE_ENABLED", "false").lower() in ("true", "1", "yes")
    cron = os.getenv("SCHEDULE_CRON", "0 10 * * 1")
    timezone = os.getenv("SCHEDULE_TIMEZONE", "Europe/Berlin")
    report_type = os.getenv("SCHEDULE_REPORT_TYPE", "bericht")
    etl_meta = await asyncio.to_thread(_get_etl_meta)

    return web.json_response({
        "ok": True,
        "schedule": {
            "enabled": schedule_enabled,
            "cron": cron,
            "timezone": timezone,
            "report_type": report_type,
        },
        "etl": etl_meta,
        "reports_count": len(get_all_reports_api()),
    })


async def handle_healthz(request: web.Request) -> web.Response:
    """Simple health endpoint for uptime checks."""
    return web.json_response({"ok": True, "service": "lkw_report_bot", "ts": int(time.time())})


async def handle_api_generate(request: web.Request) -> web.Response:
    """Handle report generation request from Mini App via HTTP POST.

    Expects JSON body:
      { "initData": "<telegram initData string>", "report_type": "bericht", "year": 2026, "week": 6 }

    Validates user via initData HMAC, then generates report in background and sends PDF to chat.
    """
    if not _bot or not _run_report_fn or not _excel_lock:
        return web.json_response({"ok": False, "error": "Server not ready"}, status=503)

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

    # Validate Telegram initData
    init_data_raw = body.get("initData", "")
    validated = _validate_init_data(init_data_raw)
    if not validated:
        return web.json_response({"ok": False, "error": "Invalid initData"}, status=403)

    user_id = _extract_user_id(validated)
    whitelist = _whitelist_fn()
    if not user_id or user_id not in whitelist:
        return web.json_response({"ok": False, "error": "Access denied"}, status=403)

    # Parse params
    report_type = body.get("report_type", "bericht")
    if report_type not in REPORT_TYPES:
        known_ids = {x["id"] for x in get_all_reports_api()}
        if report_type in known_ids:
            return web.json_response({"ok": False, "error": f"Report type not available yet: {report_type}"}, status=400)
        return web.json_response({"ok": False, "error": f"Unknown report type: {report_type}"}, status=400)

    try:
        year = int(body.get("year", 0))
        week = int(body.get("week", 0))
    except (TypeError, ValueError):
        return web.json_response({"ok": False, "error": "Invalid year/week"}, status=400)

    if not (2020 <= year <= 2100 and 1 <= week <= 53):
        return web.json_response({"ok": False, "error": "Year/week out of range"}, status=400)

    # Rate limiting
    now = time.time()
    last = _api_cooldowns.get(user_id, 0)
    if now - last < _API_COOLDOWN_SEC:
        wait = int(_API_COOLDOWN_SEC - (now - last))
        return web.json_response({"ok": False, "error": f"Please wait {wait}s"}, status=429)
    _api_cooldowns[user_id] = now

    chat_id = user_id  # For private chats, chat_id == user_id

    logger.info("API GEN start user=%s type=%s year=%s week=%s", user_id, report_type, year, week)

    # Send immediate "generating..." message to chat
    try:
        status_msg = await _bot.send_message(
            chat_id=chat_id,
            text=f"Generating report... year={year}, week={week}"
        )
    except Exception:
        logger.exception("Failed to send status message to user=%s", user_id)
        return web.json_response({"ok": False, "error": "Failed to send message"}, status=500)

    # Launch generation in background (don't block HTTP response)
    task = asyncio.create_task(_generate_and_send(chat_id, user_id, report_type, year, week, status_msg))
    task.add_done_callback(_log_task_exception)

    return web.json_response({"ok": True, "message": "Report generation started"})


def _etl_lock_path() -> pathlib.Path:
    return pathlib.Path(os.environ.get("TEMP", r"C:\Windows\Temp")) / "lkw_etl_pipeline.lock"


def _is_etl_running() -> bool:
    return _etl_lock_path().exists()


def _spawn_etl_pipeline() -> None:
    py = pathlib.Path(BASE_DIR) / ".venv" / "Scripts" / "python.exe"
    if not py.exists():
        py = pathlib.Path(sys.executable)
    script = pathlib.Path(BASE_DIR) / "run_etl_pipeline.py"
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)
    subprocess.Popen(
        [str(py), str(script)],
        cwd=BASE_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=creationflags,
    )


async def handle_api_etl_run(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        body = {}

    shared_token = (os.getenv("ETL_TRIGGER_TOKEN") or "").strip()
    auth_header = (request.headers.get("Authorization") or "").strip()
    using_shared_token = bool(shared_token) and auth_header == f"Bearer {shared_token}"

    user_id: int | None = None
    if not using_shared_token:
        init_data_raw = body.get("initData", "")
        validated = _validate_init_data(init_data_raw)
        if not validated:
          return web.json_response({"ok": False, "error": "Invalid initData"}, status=403)

        user_id = _extract_user_id(validated)
        whitelist = _whitelist_fn()
        if not user_id or user_id not in whitelist:
            return web.json_response({"ok": False, "error": "Access denied"}, status=403)

        now = time.time()
        last = _etl_trigger_cooldowns.get(user_id, 0)
        if now - last < _ETL_TRIGGER_COOLDOWN_SEC:
            wait = int(_ETL_TRIGGER_COOLDOWN_SEC - (now - last))
            return web.json_response({"ok": False, "error": f"Please wait {wait}s"}, status=429)
        _etl_trigger_cooldowns[user_id] = now

    if _is_etl_running():
        return web.json_response({"ok": True, "status": "already_running"})

    try:
        await asyncio.to_thread(_spawn_etl_pipeline)
        logger.info("ETL trigger accepted user=%s via=%s", user_id, "token" if using_shared_token else "initData")
        return web.json_response({"ok": True, "status": "started"})
    except Exception:
        logger.exception("Failed to start ETL pipeline")
        return web.json_response({"ok": False, "error": "Failed to start ETL"}, status=500)


def _log_task_exception(task: asyncio.Task) -> None:
    """Callback to log unhandled exceptions from background tasks."""
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error("Background task failed: %s", exc, exc_info=exc)


async def _generate_and_send(chat_id: int, user_id: int, report_type: str, year: int, week: int, status_msg):
    """Background task: generate report and send PDF to chat."""
    try:
        async with _excel_lock:
            try:
                await _bot.edit_message_text(
                    chat_id=chat_id,
                    message_id=status_msg.message_id,
                    text=f"Generating report... year={year}, week={week}\nStep 2/3: Running VBA + exporting..."
                )
            except Exception:
                pass

            xlsx_path, pdf_path = await asyncio.wait_for(
                asyncio.to_thread(_run_report_fn, report_type, year, week),
                timeout=30 * 60,
            )

        try:
            await _bot.edit_message_text(
                chat_id=chat_id,
                message_id=status_msg.message_id,
                text=f"Generating report... year={year}, week={week}\nStep 3/3: Sending PDF..."
            )
        except Exception:
            pass

        if pdf_path and os.path.exists(pdf_path):
            with open(pdf_path, "rb") as fp:
                await _bot.send_document(chat_id=chat_id, document=fp, filename=os.path.basename(pdf_path))

        try:
            await _bot.edit_message_text(
                chat_id=chat_id,
                message_id=status_msg.message_id,
                text="Done."
            )
        except Exception:
            pass

        logger.info("API GEN success user=%s year=%s week=%s pdf=%s", user_id, year, week, pdf_path)

        # Cleanup temp files
        for p in (pdf_path, xlsx_path):
            try:
                if p:
                    pathlib.Path(p).unlink(missing_ok=True)
            except Exception:
                pass

    except asyncio.TimeoutError:
        logger.exception("API GEN timeout user=%s year=%s week=%s", user_id, year, week)
        try:
            await _bot.edit_message_text(chat_id=chat_id, message_id=status_msg.message_id, text="Error: timeout")
        except Exception:
            pass
    except Exception:
        logger.exception("API GEN failed user=%s year=%s week=%s", user_id, year, week)
        try:
            await _bot.edit_message_text(chat_id=chat_id, message_id=status_msg.message_id, text="Error generating report.")
        except Exception:
            pass


def create_web_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/", handle_index)
    app.router.add_get("/healthz", handle_healthz)
    app.router.add_get("/api/reports", handle_api_reports)
    app.router.add_get("/api/meta", handle_api_meta)
    app.router.add_post("/api/etl/run", handle_api_etl_run)
    app.router.add_post("/api/generate", handle_api_generate)
    app.router.add_static("/static/", MINIAPP_DIR, show_index=False)
    return app


async def start_web_server(port: int = 8443) -> web.AppRunner:
    """Start the web server and return the runner (for cleanup)."""
    app = create_web_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    logger.info("Web server started on port %s", port)
    return runner
