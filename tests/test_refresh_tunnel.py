"""
Unit tests for refresh_tunnel.py — env parsing, URL extraction, tunnel logic.
"""

import os
from unittest.mock import patch, MagicMock

import pytest

from refresh_tunnel import (
    _read_env,
    _upsert_env_value,
    _extract_host,
    URL_RE,
)


class TestReadEnv:
    def test_reads_key_value_pairs(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("KEY1=value1\nKEY2=value2\n", encoding="utf-8")
        result = _read_env(str(env_file))
        assert result == {"KEY1": "value1", "KEY2": "value2"}

    def test_strips_quotes(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text('KEY="quoted_value"\n', encoding="utf-8")
        result = _read_env(str(env_file))
        assert result["KEY"] == "quoted_value"

    def test_strips_single_quotes(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("KEY='single_quoted'\n", encoding="utf-8")
        result = _read_env(str(env_file))
        assert result["KEY"] == "single_quoted"

    def test_skips_comments(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("# comment\nKEY=val\n", encoding="utf-8")
        result = _read_env(str(env_file))
        assert "#" not in "".join(result.keys())
        assert result == {"KEY": "val"}

    def test_skips_empty_lines(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("\n\nKEY=val\n\n", encoding="utf-8")
        result = _read_env(str(env_file))
        assert result == {"KEY": "val"}

    def test_nonexistent_file_returns_empty(self, tmp_path):
        result = _read_env(str(tmp_path / "no_such_file"))
        assert result == {}

    def test_value_with_equals_sign(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("KEY=val=ue=with=equals\n", encoding="utf-8")
        result = _read_env(str(env_file))
        assert result["KEY"] == "val=ue=with=equals"


class TestUpsertEnvValue:
    def test_inserts_new_key(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("EXISTING=old\n", encoding="utf-8")
        _upsert_env_value(str(env_file), "NEW_KEY", "new_value")
        content = env_file.read_text(encoding="utf-8")
        assert "NEW_KEY=new_value" in content
        assert "EXISTING=old" in content

    def test_updates_existing_key(self, tmp_path):
        env_file = tmp_path / ".env"
        env_file.write_text("WEBAPP_URL=https://old.com\n", encoding="utf-8")
        _upsert_env_value(str(env_file), "WEBAPP_URL", "https://new.com")
        content = env_file.read_text(encoding="utf-8")
        assert "WEBAPP_URL=https://new.com" in content
        assert "old.com" not in content

    def test_creates_file_if_missing(self, tmp_path):
        env_file = tmp_path / ".env"
        _upsert_env_value(str(env_file), "KEY", "value")
        assert env_file.exists()
        assert "KEY=value" in env_file.read_text(encoding="utf-8")


class TestExtractHost:
    def test_normal_url(self):
        assert _extract_host("https://abc.trycloudflare.com") == "abc.trycloudflare.com"

    def test_url_with_path(self):
        assert _extract_host("https://abc.example.com/path/to/page") == "abc.example.com"

    def test_empty_string(self):
        assert _extract_host("") == ""

    def test_invalid_url(self):
        result = _extract_host("not-a-url")
        assert isinstance(result, str)


class TestUrlRegex:
    def test_matches_trycloudflare_url(self):
        text = "https://some-random-name.trycloudflare.com"
        matches = URL_RE.findall(text)
        assert len(matches) == 1
        assert "trycloudflare.com" in matches[0]

    def test_matches_in_log_line(self):
        line = '2025-01-15 INF | https://abc-def-123.trycloudflare.com registered'
        matches = URL_RE.findall(line)
        assert len(matches) == 1

    def test_no_match_for_other_urls(self):
        assert URL_RE.findall("https://example.com") == []

    def test_case_insensitive(self):
        matches = URL_RE.findall("https://abc.TRYCLOUDFLARE.COM")
        assert len(matches) == 1
