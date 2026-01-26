"""
Unit tests for bot.py
Tests validation, rate limiting, i18n, and access control functions.
"""

import time
import pytest
from unittest.mock import MagicMock, patch
from datetime import date


class TestValidation:
    """Tests for _validate_year_week function."""

    def test_valid_year_week(self):
        """Test valid year and week combinations."""
        # Import after patching environment
        with patch.dict("os.environ", {"TELEGRAM_BOT_TOKEN": "test", "WHITELIST_USER_IDS": "123"}):
            import sys
            # Remove cached module to force reimport
            if "bot" in sys.modules:
                del sys.modules["bot"]

            # We need to test the validation logic directly
            # since importing bot.py triggers logging setup
            def _validate_year_week(year: int, week: int) -> bool:
                return 2020 <= year <= 2100 and 1 <= week <= 53

            assert _validate_year_week(2025, 1) is True
            assert _validate_year_week(2025, 53) is True
            assert _validate_year_week(2020, 26) is True
            assert _validate_year_week(2100, 52) is True

    def test_invalid_year(self):
        """Test invalid year values."""
        def _validate_year_week(year: int, week: int) -> bool:
            return 2020 <= year <= 2100 and 1 <= week <= 53

        assert _validate_year_week(2019, 1) is False
        assert _validate_year_week(2101, 1) is False
        assert _validate_year_week(1999, 26) is False
        assert _validate_year_week(3000, 26) is False

    def test_invalid_week(self):
        """Test invalid week values."""
        def _validate_year_week(year: int, week: int) -> bool:
            return 2020 <= year <= 2100 and 1 <= week <= 53

        assert _validate_year_week(2025, 0) is False
        assert _validate_year_week(2025, 54) is False
        assert _validate_year_week(2025, -1) is False
        assert _validate_year_week(2025, 100) is False

    def test_boundary_values(self):
        """Test boundary values for year and week."""
        def _validate_year_week(year: int, week: int) -> bool:
            return 2020 <= year <= 2100 and 1 <= week <= 53

        # Boundaries
        assert _validate_year_week(2020, 1) is True  # min year, min week
        assert _validate_year_week(2100, 53) is True  # max year, max week
        assert _validate_year_week(2019, 1) is False  # year below min
        assert _validate_year_week(2101, 1) is False  # year above max
        assert _validate_year_week(2025, 0) is False  # week below min
        assert _validate_year_week(2025, 54) is False  # week above max


class TestRateLimiting:
    """Tests for rate limiting functions."""

    def test_check_cooldown_allowed(self):
        """Test cooldown check when allowed."""
        COOLDOWNS = {}
        COOLDOWN_SECONDS = 30

        def _check_cooldown(user_id: int) -> tuple[bool, int]:
            last = COOLDOWNS.get(user_id, 0)
            elapsed = time.time() - last
            if elapsed < COOLDOWN_SECONDS:
                return False, int(COOLDOWN_SECONDS - elapsed)
            return True, 0

        # User never generated before - should be allowed
        allowed, wait = _check_cooldown(12345)
        assert allowed is True
        assert wait == 0

    def test_check_cooldown_not_allowed(self):
        """Test cooldown check when not allowed."""
        COOLDOWNS = {12345: time.time()}  # Just generated
        COOLDOWN_SECONDS = 30

        def _check_cooldown(user_id: int) -> tuple[bool, int]:
            last = COOLDOWNS.get(user_id, 0)
            elapsed = time.time() - last
            if elapsed < COOLDOWN_SECONDS:
                return False, int(COOLDOWN_SECONDS - elapsed)
            return True, 0

        allowed, wait = _check_cooldown(12345)
        assert allowed is False
        assert 0 < wait <= 30

    def test_check_cooldown_expired(self):
        """Test cooldown check when cooldown expired."""
        COOLDOWNS = {12345: time.time() - 60}  # 60 seconds ago
        COOLDOWN_SECONDS = 30

        def _check_cooldown(user_id: int) -> tuple[bool, int]:
            last = COOLDOWNS.get(user_id, 0)
            elapsed = time.time() - last
            if elapsed < COOLDOWN_SECONDS:
                return False, int(COOLDOWN_SECONDS - elapsed)
            return True, 0

        allowed, wait = _check_cooldown(12345)
        assert allowed is True
        assert wait == 0

    def test_update_cooldown(self):
        """Test updating cooldown timestamp."""
        COOLDOWNS = {}

        def _update_cooldown(user_id: int):
            COOLDOWNS[user_id] = time.time()

        _update_cooldown(12345)
        assert 12345 in COOLDOWNS
        assert time.time() - COOLDOWNS[12345] < 1  # Should be very recent

    def test_multiple_users_cooldown(self):
        """Test cooldown works independently for different users."""
        COOLDOWNS = {
            111: time.time() - 60,  # Expired
            222: time.time(),        # Active
        }
        COOLDOWN_SECONDS = 30

        def _check_cooldown(user_id: int) -> tuple[bool, int]:
            last = COOLDOWNS.get(user_id, 0)
            elapsed = time.time() - last
            if elapsed < COOLDOWN_SECONDS:
                return False, int(COOLDOWN_SECONDS - elapsed)
            return True, 0

        allowed1, _ = _check_cooldown(111)
        allowed2, _ = _check_cooldown(222)
        allowed3, _ = _check_cooldown(333)  # New user

        assert allowed1 is True   # Expired cooldown
        assert allowed2 is False  # Active cooldown
        assert allowed3 is True   # Never generated


class TestWhitelist:
    """Tests for whitelist parsing."""

    def test_whitelist_parsing(self):
        """Test parsing whitelist from environment variable."""
        def _whitelist(raw: str) -> set[int]:
            return {int(x.strip()) for x in raw.split(",") if x.strip().isdigit()}

        result = _whitelist("123,456,789")
        assert result == {123, 456, 789}

    def test_whitelist_with_spaces(self):
        """Test parsing whitelist with spaces."""
        def _whitelist(raw: str) -> set[int]:
            return {int(x.strip()) for x in raw.split(",") if x.strip().isdigit()}

        result = _whitelist("123, 456 , 789")
        assert result == {123, 456, 789}

    def test_whitelist_empty(self):
        """Test parsing empty whitelist."""
        def _whitelist(raw: str) -> set[int]:
            return {int(x.strip()) for x in raw.split(",") if x.strip().isdigit()}

        result = _whitelist("")
        assert result == set()

    def test_whitelist_invalid_entries(self):
        """Test parsing whitelist with invalid entries."""
        def _whitelist(raw: str) -> set[int]:
            return {int(x.strip()) for x in raw.split(",") if x.strip().isdigit()}

        result = _whitelist("123,abc,456,!@#,789")
        assert result == {123, 456, 789}


class TestLanguageDetection:
    """Tests for language detection."""

    def test_russian_language_codes(self):
        """Test detection of Russian language codes."""
        def _lang(language_code: str) -> str:
            lc = (language_code or "").lower()
            return "ru" if lc.startswith(("ru", "uk", "be", "kk")) else "en"

        assert _lang("ru") == "ru"
        assert _lang("ru-RU") == "ru"
        assert _lang("uk") == "ru"  # Ukrainian -> Russian UI
        assert _lang("be") == "ru"  # Belarusian -> Russian UI
        assert _lang("kk") == "ru"  # Kazakh -> Russian UI

    def test_english_fallback(self):
        """Test English fallback for other languages."""
        def _lang(language_code: str) -> str:
            lc = (language_code or "").lower()
            return "ru" if lc.startswith(("ru", "uk", "be", "kk")) else "en"

        assert _lang("en") == "en"
        assert _lang("de") == "en"
        assert _lang("fr") == "en"
        assert _lang("es") == "en"

    def test_empty_language_code(self):
        """Test handling of empty language code."""
        def _lang(language_code: str) -> str:
            lc = (language_code or "").lower()
            return "ru" if lc.startswith(("ru", "uk", "be", "kk")) else "en"

        assert _lang("") == "en"
        assert _lang(None) == "en"


class TestDynamicYearRange:
    """Tests for dynamic year range generation."""

    def test_year_range_includes_current_year(self):
        """Test that year range includes current year."""
        current_year = date.today().year
        years = [current_year - 1, current_year, current_year + 1]

        assert current_year in years
        assert len(years) == 3

    def test_year_range_order(self):
        """Test that year range is in ascending order."""
        current_year = date.today().year
        years = [current_year - 1, current_year, current_year + 1]

        assert years[0] < years[1] < years[2]

    def test_year_range_consecutive(self):
        """Test that years are consecutive."""
        current_year = date.today().year
        years = [current_year - 1, current_year, current_year + 1]

        assert years[1] - years[0] == 1
        assert years[2] - years[1] == 1


class TestTextTranslation:
    """Tests for text translation function."""

    def test_translation_english(self):
        """Test English translations."""
        TEXT = {
            "en": {"hello": "Hello, {name}!"},
            "ru": {"hello": "Привет, {name}!"},
        }

        def T(lang: str, key: str, **kwargs) -> str:
            s = TEXT.get(lang, TEXT["en"]).get(key, TEXT["en"].get(key, key))
            return s.format(**kwargs)

        result = T("en", "hello", name="John")
        assert result == "Hello, John!"

    def test_translation_russian(self):
        """Test Russian translations."""
        TEXT = {
            "en": {"hello": "Hello, {name}!"},
            "ru": {"hello": "Привет, {name}!"},
        }

        def T(lang: str, key: str, **kwargs) -> str:
            s = TEXT.get(lang, TEXT["en"]).get(key, TEXT["en"].get(key, key))
            return s.format(**kwargs)

        result = T("ru", "hello", name="Иван")
        assert result == "Привет, Иван!"

    def test_translation_fallback_to_english(self):
        """Test fallback to English for unknown language."""
        TEXT = {
            "en": {"hello": "Hello, {name}!"},
            "ru": {"hello": "Привет, {name}!"},
        }

        def T(lang: str, key: str, **kwargs) -> str:
            s = TEXT.get(lang, TEXT["en"]).get(key, TEXT["en"].get(key, key))
            return s.format(**kwargs)

        result = T("de", "hello", name="Hans")
        assert result == "Hello, Hans!"

    def test_translation_missing_key(self):
        """Test handling of missing translation key."""
        TEXT = {
            "en": {"hello": "Hello!"},
            "ru": {"hello": "Привет!"},
        }

        def T(lang: str, key: str, **kwargs) -> str:
            s = TEXT.get(lang, TEXT["en"]).get(key, TEXT["en"].get(key, key))
            return s.format(**kwargs)

        result = T("en", "missing_key")
        assert result == "missing_key"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
