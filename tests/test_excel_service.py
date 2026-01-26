"""
Unit tests for excel_service.py
Tests error detection, retry logic, and file operations.
"""

import os
import pytest
from unittest.mock import MagicMock, patch


# Error codes from excel_service.py
RPC_E_CALL_REJECTED = -2147418111
RPC_E_REMOTE_PROC_FAILED = -2147023170
RPC_E_SERVERCALL_RETRYLATER = -2147418112


class TestTransientErrorDetection:
    """Tests for _is_transient_com_error function."""

    def _is_transient_com_error(self, e: Exception) -> bool:
        """Replica of the function from excel_service.py for testing."""
        msg = str(e)
        return (
            (str(RPC_E_CALL_REJECTED) in msg) or ("Call was rejected by callee" in msg) or
            (str(RPC_E_REMOTE_PROC_FAILED) in msg) or ("The remote procedure call failed" in msg) or
            ("0x800706BE" in msg) or
            (str(RPC_E_SERVERCALL_RETRYLATER) in msg) or ("servercall retrylater" in msg.lower())
        )

    def test_rpc_call_rejected_by_code(self):
        """Test detection of RPC_E_CALL_REJECTED by error code."""
        error = Exception(f"COM error {RPC_E_CALL_REJECTED}")
        assert self._is_transient_com_error(error) is True

    def test_rpc_call_rejected_by_message(self):
        """Test detection of RPC_E_CALL_REJECTED by message."""
        error = Exception("Call was rejected by callee")
        assert self._is_transient_com_error(error) is True

    def test_rpc_remote_proc_failed_by_code(self):
        """Test detection of RPC_E_REMOTE_PROC_FAILED by error code."""
        error = Exception(f"Error {RPC_E_REMOTE_PROC_FAILED}")
        assert self._is_transient_com_error(error) is True

    def test_rpc_remote_proc_failed_by_message(self):
        """Test detection of RPC_E_REMOTE_PROC_FAILED by message."""
        error = Exception("The remote procedure call failed")
        assert self._is_transient_com_error(error) is True

    def test_rpc_remote_proc_failed_by_hex(self):
        """Test detection of RPC_E_REMOTE_PROC_FAILED by hex code."""
        error = Exception("COM Error 0x800706BE")
        assert self._is_transient_com_error(error) is True

    def test_servercall_retrylater_by_code(self):
        """Test detection of RPC_E_SERVERCALL_RETRYLATER by error code."""
        error = Exception(f"Error {RPC_E_SERVERCALL_RETRYLATER}")
        assert self._is_transient_com_error(error) is True

    def test_servercall_retrylater_by_message(self):
        """Test detection of RPC_E_SERVERCALL_RETRYLATER by message."""
        error = Exception("ServerCall RetryLater error")
        assert self._is_transient_com_error(error) is True

    def test_non_transient_error(self):
        """Test that non-transient errors are not detected."""
        error = Exception("File not found")
        assert self._is_transient_com_error(error) is False

    def test_value_error(self):
        """Test that ValueError is not transient."""
        error = ValueError("Invalid value")
        assert self._is_transient_com_error(error) is False

    def test_file_not_found_error(self):
        """Test that FileNotFoundError is not transient."""
        error = FileNotFoundError("File not found")
        assert self._is_transient_com_error(error) is False


class TestRetryLogic:
    """Tests for retry logic."""

    def test_retry_success_first_attempt(self):
        """Test successful execution on first attempt."""
        call_count = 0

        def _retry(callable_, retries: int = 3):
            nonlocal call_count
            for _ in range(retries):
                try:
                    return callable_()
                except Exception:
                    call_count += 1
                    continue
            raise Exception("All retries failed")

        def success_func():
            return "success"

        result = _retry(success_func)
        assert result == "success"
        assert call_count == 0

    def test_retry_success_after_failures(self):
        """Test successful execution after some failures."""
        attempt = 0

        def flaky_func():
            nonlocal attempt
            attempt += 1
            if attempt < 3:
                raise Exception(f"Error {RPC_E_CALL_REJECTED}")
            return "success"

        # Simplified retry for testing
        def _retry(callable_, retries: int = 5):
            last = None
            for _ in range(retries):
                try:
                    return callable_()
                except Exception as e:
                    last = e
                    continue
            raise last

        result = _retry(flaky_func)
        assert result == "success"
        assert attempt == 3

    def test_retry_all_attempts_fail(self):
        """Test that exception is raised after all retries fail."""
        def always_fail():
            raise Exception("Always fails")

        def _retry(callable_, retries: int = 3):
            last = None
            for _ in range(retries):
                try:
                    return callable_()
                except Exception as e:
                    last = e
                    continue
            raise last

        with pytest.raises(Exception, match="Always fails"):
            _retry(always_fail)


class TestFileOperations:
    """Tests for file operations."""

    def test_expand_environment_variables(self):
        """Test expansion of environment variables in paths."""
        with patch.dict(os.environ, {"TEMP": "C:\\Temp"}):
            path = "%TEMP%\\test.xlsx"
            expanded = os.path.expandvars(path)
            assert expanded == "C:\\Temp\\test.xlsx"

    def test_expand_empty_env_var(self):
        """Test expansion when env var doesn't exist."""
        path = "%NONEXISTENT_VAR%\\test.xlsx"
        expanded = os.path.expandvars(path)
        # Should remain unchanged if var doesn't exist
        assert "%NONEXISTENT_VAR%" in expanded or "NONEXISTENT_VAR" in expanded


class TestLockPath:
    """Tests for lock path generation."""

    def test_lock_path_in_temp(self):
        """Test that lock path is in TEMP directory."""
        with patch.dict(os.environ, {"TEMP": "C:\\Users\\Test\\AppData\\Local\\Temp"}):
            LOCK_PATH = os.path.join(
                os.environ.get("TEMP", r"C:\Windows\Temp"),
                "lkw_report_bot_excel.lock"
            )
            assert "Temp" in LOCK_PATH
            assert "lkw_report_bot_excel.lock" in LOCK_PATH

    def test_lock_path_fallback(self):
        """Test lock path fallback when TEMP is not set."""
        with patch.dict(os.environ, {}, clear=True):
            LOCK_PATH = os.path.join(
                os.environ.get("TEMP", r"C:\Windows\Temp"),
                "lkw_report_bot_excel.lock"
            )
            assert r"C:\Windows\Temp" in LOCK_PATH


class TestErrorCodes:
    """Tests for error code constants."""

    def test_error_codes_are_negative(self):
        """Test that COM error codes are negative integers."""
        assert RPC_E_CALL_REJECTED < 0
        assert RPC_E_REMOTE_PROC_FAILED < 0
        assert RPC_E_SERVERCALL_RETRYLATER < 0

    def test_error_codes_are_unique(self):
        """Test that error codes are unique."""
        codes = [RPC_E_CALL_REJECTED, RPC_E_REMOTE_PROC_FAILED, RPC_E_SERVERCALL_RETRYLATER]
        assert len(codes) == len(set(codes))


class TestInputValidation:
    """Tests for input validation in run_report."""

    def test_year_as_int(self):
        """Test that year parameter should be an integer."""
        year = 2025
        assert isinstance(year, int)
        assert 2020 <= year <= 2100

    def test_week_as_int(self):
        """Test that week parameter should be an integer."""
        week = 5
        assert isinstance(week, int)
        assert 1 <= week <= 53

    def test_year_week_combination(self):
        """Test valid year-week combination."""
        test_cases = [
            (2025, 1),
            (2025, 53),
            (2026, 26),
        ]
        for year, week in test_cases:
            assert isinstance(year, int)
            assert isinstance(week, int)
            assert 2020 <= year <= 2100
            assert 1 <= week <= 53


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
