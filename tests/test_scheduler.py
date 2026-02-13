"""
Unit tests for scheduler.py — cron parsing, setup logic.
"""

import os
from unittest.mock import MagicMock, patch, AsyncMock

import pytest

from scheduler import parse_cron, setup_scheduler


class TestParseCron:
    def test_standard_monday_10am(self):
        result = parse_cron("0 10 * * 1")
        assert result == {"minute": "0", "hour": "10", "day_of_week": "1"}

    def test_all_wildcards(self):
        assert parse_cron("* * * * *") == {}

    def test_every_field_specified(self):
        result = parse_cron("30 14 15 6 3")
        assert result == {
            "minute": "30",
            "hour": "14",
            "day": "15",
            "month": "6",
            "day_of_week": "3",
        }

    def test_too_few_fields(self):
        with pytest.raises(ValueError, match="5 fields"):
            parse_cron("0 10 * *")

    def test_too_many_fields(self):
        with pytest.raises(ValueError, match="5 fields"):
            parse_cron("0 10 * * 1 extra")

    def test_empty_string(self):
        with pytest.raises(ValueError):
            parse_cron("")

    def test_cron_ranges_and_lists(self):
        result = parse_cron("0,30 8-17 * * 1-5")
        assert result == {"minute": "0,30", "hour": "8-17", "day_of_week": "1-5"}

    def test_whitespace_handling(self):
        result = parse_cron("  0   10   *   *   1  ")
        assert result == {"minute": "0", "hour": "10", "day_of_week": "1"}


class TestSetupScheduler:
    def test_disabled_by_default(self):
        app = MagicMock()
        with patch.dict(os.environ, {"SCHEDULE_ENABLED": "false"}):
            setup_scheduler(app, MagicMock(), MagicMock())
        app.job_queue.run_custom.assert_not_called()

    def test_enabled_registers_job(self):
        app = MagicMock()
        with patch.dict(os.environ, {
            "SCHEDULE_ENABLED": "true",
            "SCHEDULE_CRON": "0 10 * * 1",
            "SCHEDULE_REPORT_TYPE": "bericht",
            "SCHEDULE_TIMEZONE": "Europe/Berlin",
        }):
            setup_scheduler(app, MagicMock(), MagicMock())
        app.job_queue.run_custom.assert_called_once()

    def test_invalid_cron_does_not_register(self):
        app = MagicMock()
        with patch.dict(os.environ, {
            "SCHEDULE_ENABLED": "true",
            "SCHEDULE_CRON": "bad",
            "SCHEDULE_REPORT_TYPE": "bericht",
        }):
            setup_scheduler(app, MagicMock(), MagicMock())
        app.job_queue.run_custom.assert_not_called()

    def test_invalid_report_type_does_not_register(self):
        app = MagicMock()
        with patch.dict(os.environ, {
            "SCHEDULE_ENABLED": "true",
            "SCHEDULE_CRON": "0 10 * * 1",
            "SCHEDULE_REPORT_TYPE": "nonexistent",
        }):
            setup_scheduler(app, MagicMock(), MagicMock())
        app.job_queue.run_custom.assert_not_called()

    def test_job_kwargs_contain_trigger_and_timezone(self):
        app = MagicMock()
        with patch.dict(os.environ, {
            "SCHEDULE_ENABLED": "true",
            "SCHEDULE_CRON": "0 10 * * 1",
            "SCHEDULE_REPORT_TYPE": "bericht",
            "SCHEDULE_TIMEZONE": "Europe/Berlin",
        }):
            setup_scheduler(app, MagicMock(), MagicMock())
        call_kwargs = app.job_queue.run_custom.call_args
        job_kwargs = call_kwargs.kwargs.get("job_kwargs") or call_kwargs[1].get("job_kwargs")
        assert job_kwargs["trigger"] == "cron"
        assert job_kwargs["timezone"] == "Europe/Berlin"
