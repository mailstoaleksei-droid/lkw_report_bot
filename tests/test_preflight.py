"""
Unit tests for preflight_check.py — configuration validation.
"""

import os
from unittest.mock import patch

import pytest

from preflight_check import main as preflight_main


def _run(env: dict) -> int:
    """Run preflight_main with load_dotenv disabled so patch.dict is not overridden."""
    with patch.dict(os.environ, env, clear=True):
        with patch("preflight_check.load_dotenv"):
            return preflight_main()


class TestPreflightCheck:
    def test_all_valid_returns_zero(self, tmp_path):
        excel_file = tmp_path / "data.xlsm"
        excel_file.write_bytes(b"fake")

        assert _run({
            "TELEGRAM_BOT_TOKEN": "123:ABC",
            "WHITELIST_USER_IDS": "111,222",
            "EXCEL_FILE_PATH": str(excel_file),
            "WEBAPP_URL": "https://example.com",
            "WEBAPP_PORT": "8443",
            "HEARTBEAT_INTERVAL_SEC": "30",
            "SCHEDULE_ENABLED": "false",
        }) == 0

    def test_missing_token_returns_one(self, tmp_path):
        excel_file = tmp_path / "data.xlsm"
        excel_file.write_bytes(b"fake")

        assert _run({
            "TELEGRAM_BOT_TOKEN": "",
            "WHITELIST_USER_IDS": "111",
            "EXCEL_FILE_PATH": str(excel_file),
            "WEBAPP_URL": "https://example.com",
            "WEBAPP_PORT": "8443",
            "HEARTBEAT_INTERVAL_SEC": "30",
            "SCHEDULE_ENABLED": "false",
        }) == 1

    def test_missing_excel_file_returns_one(self, tmp_path):
        assert _run({
            "TELEGRAM_BOT_TOKEN": "123:ABC",
            "WHITELIST_USER_IDS": "111",
            "EXCEL_FILE_PATH": str(tmp_path / "nonexistent.xlsm"),
            "WEBAPP_URL": "https://example.com",
            "WEBAPP_PORT": "8443",
            "HEARTBEAT_INTERVAL_SEC": "30",
            "SCHEDULE_ENABLED": "false",
        }) == 1

    def test_http_webapp_url_returns_one(self, tmp_path):
        excel_file = tmp_path / "data.xlsm"
        excel_file.write_bytes(b"fake")

        assert _run({
            "TELEGRAM_BOT_TOKEN": "123:ABC",
            "WHITELIST_USER_IDS": "111",
            "EXCEL_FILE_PATH": str(excel_file),
            "WEBAPP_URL": "http://insecure.com",
            "WEBAPP_PORT": "8443",
            "HEARTBEAT_INTERVAL_SEC": "30",
            "SCHEDULE_ENABLED": "false",
        }) == 1

    def test_invalid_port_returns_one(self, tmp_path):
        excel_file = tmp_path / "data.xlsm"
        excel_file.write_bytes(b"fake")

        assert _run({
            "TELEGRAM_BOT_TOKEN": "123:ABC",
            "WHITELIST_USER_IDS": "111",
            "EXCEL_FILE_PATH": str(excel_file),
            "WEBAPP_URL": "https://example.com",
            "WEBAPP_PORT": "99999",
            "HEARTBEAT_INTERVAL_SEC": "30",
            "SCHEDULE_ENABLED": "false",
        }) == 1

    def test_scheduler_enabled_with_bad_cron_returns_one(self, tmp_path):
        excel_file = tmp_path / "data.xlsm"
        excel_file.write_bytes(b"fake")

        assert _run({
            "TELEGRAM_BOT_TOKEN": "123:ABC",
            "WHITELIST_USER_IDS": "111",
            "EXCEL_FILE_PATH": str(excel_file),
            "WEBAPP_URL": "https://example.com",
            "WEBAPP_PORT": "8443",
            "HEARTBEAT_INTERVAL_SEC": "30",
            "SCHEDULE_ENABLED": "true",
            "SCHEDULE_CRON": "bad",
            "SCHEDULE_TIMEZONE": "Europe/Berlin",
            "SCHEDULE_USER_IDS": "111",
        }) == 1

    def test_scheduler_enabled_valid_config(self, tmp_path):
        excel_file = tmp_path / "data.xlsm"
        excel_file.write_bytes(b"fake")

        assert _run({
            "TELEGRAM_BOT_TOKEN": "123:ABC",
            "WHITELIST_USER_IDS": "111",
            "EXCEL_FILE_PATH": str(excel_file),
            "WEBAPP_URL": "https://example.com",
            "WEBAPP_PORT": "8443",
            "HEARTBEAT_INTERVAL_SEC": "30",
            "SCHEDULE_ENABLED": "true",
            "SCHEDULE_CRON": "0 10 * * 1",
            "SCHEDULE_TIMEZONE": "Europe/Berlin",
            "SCHEDULE_USER_IDS": "111",
        }) == 0

    def test_empty_excel_path_returns_one(self):
        assert _run({
            "TELEGRAM_BOT_TOKEN": "123:ABC",
            "WHITELIST_USER_IDS": "111",
            "EXCEL_FILE_PATH": "",
            "WEBAPP_URL": "https://example.com",
            "WEBAPP_PORT": "8443",
            "HEARTBEAT_INTERVAL_SEC": "30",
            "SCHEDULE_ENABLED": "false",
        }) == 1

    def test_non_numeric_port_returns_one(self, tmp_path):
        excel_file = tmp_path / "data.xlsm"
        excel_file.write_bytes(b"fake")

        assert _run({
            "TELEGRAM_BOT_TOKEN": "123:ABC",
            "WHITELIST_USER_IDS": "111",
            "EXCEL_FILE_PATH": str(excel_file),
            "WEBAPP_URL": "https://example.com",
            "WEBAPP_PORT": "abc",
            "HEARTBEAT_INTERVAL_SEC": "30",
            "SCHEDULE_ENABLED": "false",
        }) == 1
