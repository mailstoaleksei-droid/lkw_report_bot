"""
Tests for scheduler/report registry/web metadata.
"""

import json
import os
from unittest.mock import patch

import pytest

from report_config import get_all_reports_api
from scheduler import parse_cron
from web_server import handle_api_meta


class TestSchedulerCron:
    def test_parse_cron_valid(self):
        result = parse_cron("0 10 * * 1")
        assert result == {"minute": "0", "hour": "10", "day_of_week": "1"}

    def test_parse_cron_all_wildcards(self):
        result = parse_cron("* * * * *")
        assert result == {}

    def test_parse_cron_invalid_field_count(self):
        with pytest.raises(ValueError):
            parse_cron("0 10 * *")


class TestReportRegistry:
    def test_reports_api_contains_bericht(self):
        items = get_all_reports_api()
        ids = {x["id"] for x in items}
        assert "bericht" in ids

        bericht = next(x for x in items if x["id"] == "bericht")
        assert bericht["enabled"] is True
        assert "name" in bericht
        assert "description" in bericht
        assert "params" in bericht

    def test_reports_api_contains_future_placeholders(self):
        items = get_all_reports_api()
        disabled = [x for x in items if x.get("enabled") is False]
        assert len(disabled) >= 1


class TestWebMeta:
    @pytest.mark.asyncio
    async def test_api_meta_defaults(self):
        with patch.dict(os.environ, {}, clear=True):
            resp = await handle_api_meta(None)  # request is unused
            assert resp.status == 200
            payload = json.loads(resp.text)
            assert payload["ok"] is True
            assert payload["schedule"]["cron"] == "0 10 * * 1"
            assert payload["schedule"]["timezone"] == "Europe/Berlin"
            assert payload["schedule"]["enabled"] is False

    @pytest.mark.asyncio
    async def test_api_meta_from_env(self):
        with patch.dict(
            os.environ,
            {
                "SCHEDULE_ENABLED": "true",
                "SCHEDULE_CRON": "15 9 * * 1",
                "SCHEDULE_TIMEZONE": "Europe/Berlin",
                "SCHEDULE_REPORT_TYPE": "bericht",
            },
            clear=True,
        ):
            resp = await handle_api_meta(None)  # request is unused
            assert resp.status == 200
            payload = json.loads(resp.text)
            assert payload["ok"] is True
            assert payload["schedule"]["enabled"] is True
            assert payload["schedule"]["cron"] == "15 9 * * 1"
            assert payload["schedule"]["timezone"] == "Europe/Berlin"
            assert payload["schedule"]["report_type"] == "bericht"
