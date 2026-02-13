"""
Unit tests for web_server.py — initData validation, user extraction, routes, rate limiting.
"""

import hashlib
import hmac
import json
import os
import time
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import urlencode

import pytest

from web_server import (
    _validate_init_data,
    _extract_user_id,
    _log_task_exception,
    handle_healthz,
    handle_api_reports,
    handle_api_meta,
    handle_api_generate,
    init_web_app,
    create_web_app,
    _api_cooldowns,
    _INIT_DATA_MAX_AGE_SEC,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"


def _fresh_auth_date() -> str:
    """Return a current auth_date string (passes expiration check)."""
    return str(int(time.time()))


def _build_init_data(params: dict, token: str = BOT_TOKEN) -> str:
    """Build a valid Telegram initData string with correct HMAC hash."""
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))
    h = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
    params["hash"] = h
    return urlencode(params)


# ---------------------------------------------------------------------------
# initData validation
# ---------------------------------------------------------------------------

class TestValidateInitData:
    def setup_method(self):
        import web_server
        web_server._bot_token = BOT_TOKEN

    def test_valid_init_data(self):
        params = {"auth_date": _fresh_auth_date(), "user": json.dumps({"id": 111})}
        raw = _build_init_data(params)
        result = _validate_init_data(raw)
        assert result is not None
        assert "auth_date" in result

    def test_invalid_hash_returns_none(self):
        raw = "auth_date=123&user=%7B%22id%22%3A111%7D&hash=badhash"
        result = _validate_init_data(raw)
        assert result is None

    def test_empty_string_returns_none(self):
        assert _validate_init_data("") is None

    def test_missing_hash_returns_none(self):
        raw = "auth_date=123&user=%7B%22id%22%3A111%7D"
        assert _validate_init_data(raw) is None

    def test_no_bot_token_returns_none(self):
        import web_server
        old = web_server._bot_token
        web_server._bot_token = ""
        try:
            params = {"auth_date": _fresh_auth_date(), "user": json.dumps({"id": 111})}
            raw = _build_init_data(params, BOT_TOKEN)
            assert _validate_init_data(raw) is None
        finally:
            web_server._bot_token = old

    def test_expired_auth_date_returns_none(self):
        """initData older than _INIT_DATA_MAX_AGE_SEC should be rejected."""
        old_ts = str(int(time.time()) - _INIT_DATA_MAX_AGE_SEC - 60)
        params = {"auth_date": old_ts, "user": json.dumps({"id": 111})}
        raw = _build_init_data(params)
        assert _validate_init_data(raw) is None

    def test_recent_auth_date_accepted(self):
        """initData from 10 seconds ago should be accepted."""
        recent_ts = str(int(time.time()) - 10)
        params = {"auth_date": recent_ts, "user": json.dumps({"id": 111})}
        raw = _build_init_data(params)
        assert _validate_init_data(raw) is not None

    def test_auth_date_zero_skips_expiration(self):
        """auth_date=0 should skip the age check (HMAC is still valid)."""
        params = {"auth_date": "0", "user": json.dumps({"id": 111})}
        raw = _build_init_data(params)
        result = _validate_init_data(raw)
        assert result is not None


class TestExtractUserId:
    def test_valid_user_json(self):
        data = {"user": json.dumps({"id": 12345, "first_name": "Test"})}
        assert _extract_user_id(data) == 12345

    def test_missing_user_key(self):
        assert _extract_user_id({}) is None

    def test_empty_user_string(self):
        assert _extract_user_id({"user": ""}) is None

    def test_invalid_json(self):
        assert _extract_user_id({"user": "not-json"}) is None

    def test_user_without_id(self):
        assert _extract_user_id({"user": json.dumps({"first_name": "X"})}) is None

    def test_user_id_zero(self):
        assert _extract_user_id({"user": json.dumps({"id": 0})}) is None


# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------

class TestHealthz:
    @pytest.mark.asyncio
    async def test_healthz_returns_ok(self):
        resp = await handle_healthz(None)
        assert resp.status == 200
        body = json.loads(resp.text)
        assert body["ok"] is True
        assert body["service"] == "lkw_report_bot"
        assert "ts" in body

    @pytest.mark.asyncio
    async def test_healthz_timestamp_is_recent(self):
        resp = await handle_healthz(None)
        body = json.loads(resp.text)
        assert abs(body["ts"] - int(time.time())) < 5


# ---------------------------------------------------------------------------
# API reports
# ---------------------------------------------------------------------------

class TestApiReports:
    @pytest.mark.asyncio
    async def test_returns_list(self):
        resp = await handle_api_reports(None)
        assert resp.status == 200
        body = json.loads(resp.text)
        assert isinstance(body, list)
        assert len(body) >= 1

    @pytest.mark.asyncio
    async def test_bericht_in_list(self):
        resp = await handle_api_reports(None)
        body = json.loads(resp.text)
        ids = {x["id"] for x in body}
        assert "bericht" in ids


# ---------------------------------------------------------------------------
# API meta
# ---------------------------------------------------------------------------

class TestApiMeta:
    @pytest.mark.asyncio
    async def test_meta_defaults(self):
        with patch.dict(os.environ, {"SCHEDULE_ENABLED": "false"}, clear=False):
            resp = await handle_api_meta(None)
            body = json.loads(resp.text)
            assert body["ok"] is True
            assert body["schedule"]["enabled"] is False

    @pytest.mark.asyncio
    async def test_meta_schedule_enabled(self):
        with patch.dict(os.environ, {"SCHEDULE_ENABLED": "true", "SCHEDULE_CRON": "5 8 * * 1"}):
            resp = await handle_api_meta(None)
            body = json.loads(resp.text)
            assert body["schedule"]["enabled"] is True
            assert body["schedule"]["cron"] == "5 8 * * 1"


# ---------------------------------------------------------------------------
# API generate — input validation
# ---------------------------------------------------------------------------

class TestApiGenerate:
    def setup_method(self):
        import web_server
        self._old_bot = web_server._bot
        self._old_lock = web_server._excel_lock
        self._old_fn = web_server._run_report_fn
        self._old_wl_fn = web_server._whitelist_fn
        self._old_token = web_server._bot_token

        web_server._bot = AsyncMock()
        web_server._excel_lock = MagicMock()
        web_server._run_report_fn = MagicMock()
        web_server._whitelist_fn = lambda: {111, 222}
        web_server._bot_token = BOT_TOKEN
        _api_cooldowns.clear()

    def teardown_method(self):
        import web_server
        web_server._bot = self._old_bot
        web_server._excel_lock = self._old_lock
        web_server._run_report_fn = self._old_fn
        web_server._whitelist_fn = self._old_wl_fn
        web_server._bot_token = self._old_token
        _api_cooldowns.clear()

    def _make_request(self, body: dict) -> MagicMock:
        req = MagicMock()
        req.json = AsyncMock(return_value=body)
        return req

    @pytest.mark.asyncio
    async def test_invalid_json(self):
        req = MagicMock()
        req.json = AsyncMock(side_effect=ValueError("bad json"))
        resp = await handle_api_generate(req)
        assert resp.status == 400

    @pytest.mark.asyncio
    async def test_missing_init_data(self):
        req = self._make_request({"report_type": "bericht", "year": 2025, "week": 5})
        resp = await handle_api_generate(req)
        assert resp.status == 403

    @pytest.mark.asyncio
    async def test_invalid_init_data(self):
        req = self._make_request({"initData": "bad", "report_type": "bericht", "year": 2025, "week": 5})
        resp = await handle_api_generate(req)
        assert resp.status == 403

    @pytest.mark.asyncio
    async def test_user_not_in_whitelist(self):
        import web_server
        web_server._whitelist_fn = lambda: {999}  # user 111 not in whitelist

        user_data = {"auth_date": _fresh_auth_date(), "user": json.dumps({"id": 111})}
        init_data = _build_init_data(user_data)
        req = self._make_request({"initData": init_data, "report_type": "bericht", "year": 2025, "week": 5})
        resp = await handle_api_generate(req)
        assert resp.status == 403

    @pytest.mark.asyncio
    async def test_unknown_report_type(self):
        user_data = {"auth_date": _fresh_auth_date(), "user": json.dumps({"id": 111})}
        init_data = _build_init_data(user_data)
        req = self._make_request({"initData": init_data, "report_type": "unknown_xyz", "year": 2025, "week": 5})
        resp = await handle_api_generate(req)
        assert resp.status == 400

    @pytest.mark.asyncio
    async def test_year_out_of_range(self):
        user_data = {"auth_date": _fresh_auth_date(), "user": json.dumps({"id": 111})}
        init_data = _build_init_data(user_data)
        req = self._make_request({"initData": init_data, "report_type": "bericht", "year": 1999, "week": 5})
        resp = await handle_api_generate(req)
        assert resp.status == 400

    @pytest.mark.asyncio
    async def test_week_out_of_range(self):
        user_data = {"auth_date": _fresh_auth_date(), "user": json.dumps({"id": 111})}
        init_data = _build_init_data(user_data)
        req = self._make_request({"initData": init_data, "report_type": "bericht", "year": 2025, "week": 54})
        resp = await handle_api_generate(req)
        assert resp.status == 400

    @pytest.mark.asyncio
    async def test_rate_limiting(self):
        import web_server
        web_server._bot.send_message = AsyncMock(return_value=MagicMock(message_id=1))

        user_data = {"auth_date": _fresh_auth_date(), "user": json.dumps({"id": 111})}
        init_data = _build_init_data(user_data)
        body = {"initData": init_data, "report_type": "bericht", "year": 2025, "week": 5}

        # First request should succeed (200)
        req1 = self._make_request(body)
        resp1 = await handle_api_generate(req1)
        assert resp1.status == 200

        # Second immediate request should be rate-limited (429)
        req2 = self._make_request(body)
        resp2 = await handle_api_generate(req2)
        assert resp2.status == 429

    @pytest.mark.asyncio
    async def test_server_not_ready(self):
        import web_server
        web_server._bot = None  # not initialized

        req = self._make_request({"initData": "x", "year": 2025, "week": 5})
        resp = await handle_api_generate(req)
        assert resp.status == 503

    @pytest.mark.asyncio
    async def test_expired_init_data_rejected(self):
        """API should reject expired initData with 403."""
        old_ts = str(int(time.time()) - _INIT_DATA_MAX_AGE_SEC - 120)
        user_data = {"auth_date": old_ts, "user": json.dumps({"id": 111})}
        init_data = _build_init_data(user_data)
        req = self._make_request({"initData": init_data, "report_type": "bericht", "year": 2025, "week": 5})
        resp = await handle_api_generate(req)
        assert resp.status == 403


# ---------------------------------------------------------------------------
# Background task exception logging
# ---------------------------------------------------------------------------

class TestLogTaskException:
    def test_cancelled_task_no_error(self):
        task = MagicMock()
        task.cancelled.return_value = True
        # Should not raise
        _log_task_exception(task)
        task.exception.assert_not_called()

    def test_successful_task_no_error(self):
        task = MagicMock()
        task.cancelled.return_value = False
        task.exception.return_value = None
        _log_task_exception(task)

    def test_failed_task_logs(self):
        task = MagicMock()
        task.cancelled.return_value = False
        task.exception.return_value = RuntimeError("boom")
        # Should not raise (just logs)
        _log_task_exception(task)


# ---------------------------------------------------------------------------
# Web app creation
# ---------------------------------------------------------------------------

class TestCreateWebApp:
    def test_app_has_routes(self):
        app = create_web_app()
        route_names = {r.resource.canonical for r in app.router.routes() if hasattr(r, 'resource') and hasattr(r.resource, 'canonical')}
        assert "/" in route_names
        assert "/healthz" in route_names
        assert "/api/reports" in route_names
        assert "/api/meta" in route_names
        assert "/api/generate" in route_names
