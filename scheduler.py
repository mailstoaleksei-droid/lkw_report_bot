"""
Scheduled report generation.

Uses python-telegram-bot's built-in JobQueue (APScheduler under the hood).
Configuration via environment variables:
  SCHEDULE_ENABLED=true
  SCHEDULE_CRON=0 10 * * 1       # cron expression (minute hour day month weekday)
  SCHEDULE_REPORT_TYPE=bericht    # which report to generate
  SCHEDULE_TIMEZONE=Europe/Berlin
  SCHEDULE_USER_IDS=123,456       # optional; fallback to WHITELIST_USER_IDS
"""

import os
import logging
import pathlib
import asyncio

from datetime import date, datetime
from zoneinfo import ZoneInfo

from telegram.ext import ContextTypes

from report_config import get_report_config

logger = logging.getLogger("lkw_report_bot.scheduler")


def parse_cron(cron_str: str) -> dict:
    """Parse '0 8 * * 1' into APScheduler trigger kwargs."""
    parts = cron_str.strip().split()
    if len(parts) != 5:
        raise ValueError(f"Invalid cron expression (need 5 fields): {cron_str!r}")

    keys = ["minute", "hour", "day", "month", "day_of_week"]
    result = {}
    for key, val in zip(keys, parts):
        if val != "*":
            result[key] = val
    return result


def setup_scheduler(app, excel_lock, run_report_fn):
    """
    Register scheduled jobs if SCHEDULE_ENABLED=true.
    Called during bot startup.

    Args:
        app: telegram Application instance
        excel_lock: asyncio.Lock for Excel access
        run_report_fn: callable(report_type, year, week) -> (xlsx_path, pdf_path)
    """
    enabled = os.getenv("SCHEDULE_ENABLED", "false").lower() in ("true", "1", "yes")
    if not enabled:
        logger.info("Scheduler disabled (SCHEDULE_ENABLED != true)")
        return

    cron_str = os.getenv("SCHEDULE_CRON", "0 10 * * 1")
    report_type = os.getenv("SCHEDULE_REPORT_TYPE", "bericht")
    timezone = os.getenv("SCHEDULE_TIMEZONE", "Europe/Berlin")

    try:
        cron_kwargs = parse_cron(cron_str)
    except ValueError as e:
        logger.error("Invalid SCHEDULE_CRON: %s", e)
        return

    # Validate report type exists
    try:
        get_report_config(report_type)
    except KeyError as e:
        logger.error("Invalid SCHEDULE_REPORT_TYPE: %s", e)
        return

    async def scheduled_report(context: ContextTypes.DEFAULT_TYPE):
        """Generate and send scheduled report to all whitelisted users."""
        try:
            now_local = datetime.now(ZoneInfo(timezone))
            iso = now_local.isocalendar()
        except Exception:
            iso = date.today().isocalendar()

        year = iso.year
        week = iso.week

        logger.info("Scheduled report: type=%s year=%s week=%s", report_type, year, week)

        schedule_users_raw = os.getenv("SCHEDULE_USER_IDS", "").strip()
        user_ids_raw = schedule_users_raw if schedule_users_raw else os.getenv("WHITELIST_USER_IDS", "")
        user_ids = [int(x.strip()) for x in user_ids_raw.split(",") if x.strip().isdigit()]

        if not user_ids:
            logger.warning("No users in whitelist for scheduled report")
            return

        async with excel_lock:
            try:
                xlsx_path, pdf_path = await asyncio.wait_for(
                    asyncio.to_thread(run_report_fn, report_type, year, week),
                    timeout=30 * 60,
                )
            except Exception as e:
                logger.exception("Scheduled report generation failed: %s", e)
                return

        # Send PDF to all whitelisted users
        for uid in user_ids:
            try:
                if pdf_path and os.path.exists(pdf_path):
                    with open(pdf_path, "rb") as fp:
                        await context.bot.send_document(
                            chat_id=uid,
                            document=fp,
                            filename=os.path.basename(pdf_path),
                            caption=f"Scheduled report: {report_type} (Year {year}, Week {week})",
                        )
                    logger.info("Scheduled report sent to user %s", uid)
            except Exception as e:
                logger.error("Failed to send scheduled report to user %s: %s", uid, e)

        # Cleanup temp files
        for p in (pdf_path, xlsx_path):
            try:
                if p:
                    pathlib.Path(p).unlink(missing_ok=True)
            except Exception:
                pass

        logger.info("Scheduled report complete")

    # Register the job
    app.job_queue.run_custom(
        callback=scheduled_report,
        job_kwargs={
            "trigger": "cron",
            "timezone": timezone,
            **cron_kwargs,
        },
        name="scheduled_report",
    )

    logger.info(
        "Scheduler registered: cron='%s' report_type='%s' timezone='%s'",
        cron_str, report_type, timezone,
    )
