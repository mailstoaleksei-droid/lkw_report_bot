"""
Unit tests for report_config.py — report registry, config lookup, API serialization.
"""

import pytest

from report_config import (
    REPORT_TYPES,
    FUTURE_REPORTS,
    get_report_config,
    get_all_reports_api,
)


class TestGetReportConfig:
    def test_known_type_returns_dict(self):
        cfg = get_report_config("bericht")
        assert isinstance(cfg, dict)

    def test_known_type_has_required_keys(self):
        cfg = get_report_config("bericht")
        for key in ("enabled", "vba_macro", "named_ranges_in", "named_ranges_out", "params", "name"):
            assert key in cfg, f"Missing key: {key}"

    def test_unknown_type_raises_key_error(self):
        with pytest.raises(KeyError, match="Unknown report type"):
            get_report_config("nonexistent_report")

    def test_unknown_type_message_lists_available(self):
        with pytest.raises(KeyError, match="bericht"):
            get_report_config("bad")

    def test_bericht_macro_name(self):
        cfg = get_report_config("bericht")
        assert cfg["vba_macro"] == "GenerateAndExportReport_FromParams"

    def test_bericht_named_ranges_in(self):
        cfg = get_report_config("bericht")
        assert "Report_Year" in cfg["named_ranges_in"]
        assert "Report_Week" in cfg["named_ranges_in"]

    def test_bericht_named_ranges_out(self):
        cfg = get_report_config("bericht")
        assert "xlsx" in cfg["named_ranges_out"]
        assert "pdf" in cfg["named_ranges_out"]

    def test_bericht_params_have_year_and_week(self):
        cfg = get_report_config("bericht")
        param_ids = {p["id"] for p in cfg["params"]}
        assert param_ids == {"year", "week"}


class TestGetAllReportsApi:
    def test_returns_list(self):
        result = get_all_reports_api()
        assert isinstance(result, list)

    def test_contains_bericht(self):
        items = get_all_reports_api()
        ids = {x["id"] for x in items}
        assert "bericht" in ids

    def test_bericht_enabled(self):
        items = get_all_reports_api()
        bericht = next(x for x in items if x["id"] == "bericht")
        assert bericht["enabled"] is True

    def test_includes_future_reports(self):
        items = get_all_reports_api()
        ids = {x["id"] for x in items}
        for fr in FUTURE_REPORTS:
            assert fr["id"] in ids

    def test_future_reports_disabled(self):
        items = get_all_reports_api()
        for fr_def in FUTURE_REPORTS:
            match = next(x for x in items if x["id"] == fr_def["id"])
            assert match["enabled"] is False

    def test_api_items_have_required_fields(self):
        items = get_all_reports_api()
        for item in items:
            for field in ("id", "enabled", "name"):
                assert field in item, f"Missing field '{field}' in {item['id']}"

    def test_bericht_name_bilingual(self):
        items = get_all_reports_api()
        bericht = next(x for x in items if x["id"] == "bericht")
        assert "en" in bericht["name"]
        assert "ru" in bericht["name"]

    def test_serializable_no_callables(self):
        """API output must be JSON-safe (no functions, lambdas, etc.)."""
        import json
        items = get_all_reports_api()
        # Should not raise
        json.dumps(items, ensure_ascii=False)


class TestReportTypesIntegrity:
    def test_all_enabled_reports_have_vba_macro(self):
        for key, cfg in REPORT_TYPES.items():
            if cfg.get("enabled"):
                assert "vba_macro" in cfg, f"{key} missing vba_macro"

    def test_all_enabled_reports_have_named_ranges(self):
        for key, cfg in REPORT_TYPES.items():
            if cfg.get("enabled"):
                assert "named_ranges_in" in cfg, f"{key} missing named_ranges_in"
                assert "named_ranges_out" in cfg, f"{key} missing named_ranges_out"

    def test_param_ids_match_named_ranges_in_values(self):
        for key, cfg in REPORT_TYPES.items():
            if not cfg.get("enabled"):
                continue
            param_ids = {p["id"] for p in cfg["params"]}
            range_refs = set(cfg["named_ranges_in"].values())
            assert range_refs.issubset(param_ids), (
                f"{key}: named_ranges_in references {range_refs - param_ids} not in params"
            )
