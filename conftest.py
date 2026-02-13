"""
Shared pytest fixtures and configuration.
Prevents bot.py side-effects (logging, lock files, env loading) during test import.
"""

import os
import sys
from unittest.mock import patch, MagicMock

import pytest


@pytest.fixture(autouse=True)
def _isolate_env(tmp_path, monkeypatch):
    """Ensure tests don't read the real .env or write lock/heartbeat files."""
    monkeypatch.setenv("TEMP", str(tmp_path))
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token-000")
    monkeypatch.setenv("WHITELIST_USER_IDS", "111,222,333")
    monkeypatch.setenv("EXCEL_FILE_PATH", str(tmp_path / "fake.xlsm"))
    monkeypatch.setenv("WEBAPP_URL", "https://test.example.com")
    monkeypatch.setenv("WEBAPP_PORT", "8443")
    monkeypatch.setenv("HEARTBEAT_INTERVAL_SEC", "30")
    monkeypatch.setenv("ADMIN_CHAT_ID", "999")
    monkeypatch.setenv("SCHEDULE_ENABLED", "false")
