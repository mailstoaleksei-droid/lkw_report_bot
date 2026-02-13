"""
Unit tests for excel_service.py — tests the actual module functions.
Does NOT require Excel/COM; mocks pywin32 where needed.
"""

import os
import time
import threading
from unittest.mock import patch, MagicMock

import pytest

from excel_service import (
    _is_transient_com_error,
    _is_retryable_error,
    _retry,
    _expand_and_copy_source_workbook,
    LOCK_PATH,
    RPC_E_CALL_REJECTED,
    RPC_E_REMOTE_PROC_FAILED,
    RPC_E_SERVERCALL_RETRYLATER,
    RPC_E_SERVER_UNAVAILABLE,
)


# ---------------------------------------------------------------------------
# Transient COM error detection
# ---------------------------------------------------------------------------

class TestIsTransientComError:
    @pytest.mark.parametrize("msg", [
        f"COM error {RPC_E_CALL_REJECTED}",
        "Call was rejected by callee",
        f"Error {RPC_E_REMOTE_PROC_FAILED}",
        "The remote procedure call failed",
        "0x800706BE something",
        f"Error {RPC_E_SERVERCALL_RETRYLATER}",
        "ServerCall RetryLater error",
        f"RPC {RPC_E_SERVER_UNAVAILABLE}",
        "rpc server is unavailable",
    ])
    def test_transient_errors_detected(self, msg):
        assert _is_transient_com_error(Exception(msg)) is True

    @pytest.mark.parametrize("msg", [
        "File not found",
        "Invalid value",
        "Permission denied",
        "Division by zero",
        "",
    ])
    def test_non_transient_errors_not_detected(self, msg):
        assert _is_transient_com_error(Exception(msg)) is False


class TestIsRetryableError:
    def test_transient_com_is_retryable(self):
        assert _is_retryable_error(Exception("Call was rejected by callee")) is True

    def test_file_access_error_is_retryable(self):
        assert _is_retryable_error(Exception("cannot access the file because it is locked")) is True

    def test_used_by_another_process_is_retryable(self):
        assert _is_retryable_error(Exception("being used by another process")) is True

    def test_generic_error_is_not_retryable(self):
        assert _is_retryable_error(Exception("some random error")) is False


# ---------------------------------------------------------------------------
# Retry mechanism
# ---------------------------------------------------------------------------

class TestRetry:
    @patch("excel_service.pythoncom")
    def test_succeeds_first_try(self, mock_com):
        result = _retry(lambda: 42)
        assert result == 42

    @patch("excel_service.pythoncom")
    @patch("excel_service.time.sleep")
    def test_retries_on_transient_error(self, mock_sleep, mock_com):
        call_count = 0

        def flaky():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise Exception(f"COM error {RPC_E_CALL_REJECTED}")
            return "ok"

        result = _retry(flaky, retries=5, sleep_sec=0.01)
        assert result == "ok"
        assert call_count == 3

    @patch("excel_service.pythoncom")
    def test_raises_non_transient_immediately(self, mock_com):
        def bad():
            raise ValueError("not transient")

        with pytest.raises(ValueError, match="not transient"):
            _retry(bad, retries=5)

    @patch("excel_service.pythoncom")
    @patch("excel_service.time.sleep")
    def test_raises_last_error_after_exhaustion(self, mock_sleep, mock_com):
        def always_transient():
            raise Exception(f"COM error {RPC_E_CALL_REJECTED}")

        with pytest.raises(Exception, match=str(RPC_E_CALL_REJECTED)):
            _retry(always_transient, retries=3, sleep_sec=0.01)


# ---------------------------------------------------------------------------
# Workbook copy
# ---------------------------------------------------------------------------

class TestExpandAndCopySourceWorkbook:
    def test_returns_source_when_no_bot_copy(self, monkeypatch):
        monkeypatch.delenv("EXCEL_BOT_COPY", raising=False)
        result = _expand_and_copy_source_workbook("C:\\src.xlsm")
        assert result == "C:\\src.xlsm"

    def test_copies_to_bot_copy_path(self, tmp_path, monkeypatch):
        src = tmp_path / "source.xlsm"
        src.write_bytes(b"fake-excel-data")

        dst = tmp_path / "copy.xlsm"
        monkeypatch.setenv("EXCEL_BOT_COPY", str(dst))

        result = _expand_and_copy_source_workbook(str(src))
        assert os.path.exists(result)
        assert open(result, "rb").read() == b"fake-excel-data"

    def test_fallback_to_source_on_copy_error(self, tmp_path, monkeypatch):
        src = str(tmp_path / "source.xlsm")
        # Source doesn't exist -> copy will fail
        monkeypatch.setenv("EXCEL_BOT_COPY", str(tmp_path / "sub" / "sub2" / "copy.xlsm"))
        result = _expand_and_copy_source_workbook(src)
        # Should fall back to source path
        assert result == src


# ---------------------------------------------------------------------------
# Lock path
# ---------------------------------------------------------------------------

class TestLockPath:
    def test_lock_path_contains_expected_name(self):
        assert "lkw_report_bot_excel.lock" in LOCK_PATH

    def test_lock_path_uses_temp_dir(self):
        temp = os.environ.get("TEMP", "")
        if temp:
            assert temp in LOCK_PATH or "Temp" in LOCK_PATH


# ---------------------------------------------------------------------------
# Error code constants
# ---------------------------------------------------------------------------

class TestErrorCodeConstants:
    def test_all_negative(self):
        for code in (RPC_E_CALL_REJECTED, RPC_E_REMOTE_PROC_FAILED,
                     RPC_E_SERVERCALL_RETRYLATER, RPC_E_SERVER_UNAVAILABLE):
            assert code < 0

    def test_all_unique(self):
        codes = [RPC_E_CALL_REJECTED, RPC_E_REMOTE_PROC_FAILED,
                 RPC_E_SERVERCALL_RETRYLATER, RPC_E_SERVER_UNAVAILABLE]
        assert len(codes) == len(set(codes))
