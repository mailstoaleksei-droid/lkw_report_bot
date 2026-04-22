from datetime import datetime, timedelta, timezone
from urllib import parse

import check_etl_freshness as freshness


def _dt_utc(year, month, day, hour, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


def test_weekday_window_healthy_when_sources_are_recent(monkeypatch):
    monkeypatch.delenv("ETL_EXPECTED_INTERVAL_MIN", raising=False)
    monkeypatch.delenv("ETL_EXPECTED_GRACE_MIN", raising=False)
    now_utc = _dt_utc(2026, 4, 21, 8, 0)  # Tuesday 10:00 Europe/Berlin
    now_local = now_utc.astimezone(freshness._schedule_timezone())
    last_success = {
        "xlsm_lkw_fahrer_data": now_utc - timedelta(minutes=45),
        "xlsb_fahrer_plan": now_utc - timedelta(minutes=30),
    }

    stale, stale_sources = freshness.evaluate_etl_health(last_success, now_utc, now_local)

    assert stale is False
    assert stale_sources == []


def test_weekday_window_flags_each_stale_source(monkeypatch):
    monkeypatch.delenv("ETL_EXPECTED_INTERVAL_MIN", raising=False)
    monkeypatch.delenv("ETL_EXPECTED_GRACE_MIN", raising=False)
    now_utc = _dt_utc(2026, 4, 21, 8, 0)  # Tuesday 10:00 Europe/Berlin
    now_local = now_utc.astimezone(freshness._schedule_timezone())
    last_success = {
        "xlsm_lkw_fahrer_data": now_utc - timedelta(hours=2),
        "xlsb_fahrer_plan": now_utc - timedelta(minutes=20),
    }

    stale, stale_sources = freshness.evaluate_etl_health(last_success, now_utc, now_local)

    assert stale is True
    assert [item["source_name"] for item in stale_sources] == ["xlsm_lkw_fahrer_data"]
    assert stale_sources[0]["threshold_sec"] == 90 * 60


def test_weekend_does_not_alert_even_when_data_is_old():
    now_utc = _dt_utc(2026, 4, 19, 8, 0)  # Sunday
    now_local = now_utc.astimezone(freshness._schedule_timezone())
    last_success = {
        "xlsm_lkw_fahrer_data": now_utc - timedelta(days=2),
        "xlsb_fahrer_plan": now_utc - timedelta(days=2),
    }

    stale, stale_sources = freshness.evaluate_etl_health(last_success, now_utc, now_local)

    assert stale is False
    assert stale_sources == []


def test_morning_grace_does_not_alert_before_first_run_window():
    now_utc = _dt_utc(2026, 4, 21, 5, 30)  # Tuesday 07:30 Europe/Berlin
    now_local = now_utc.astimezone(freshness._schedule_timezone())
    last_success = {
        "xlsm_lkw_fahrer_data": now_utc - timedelta(days=1),
        "xlsb_fahrer_plan": now_utc - timedelta(days=1),
    }

    stale, stale_sources = freshness.evaluate_etl_health(last_success, now_utc, now_local)

    assert stale is False
    assert stale_sources == []


def test_send_telegram_defaults_to_admin_chat_id(monkeypatch):
    sent = {}

    class _Resp:
        def read(self):
            return b"{}"

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    def fake_urlopen(req, timeout):
        sent["url"] = req.full_url
        sent["data"] = req.data
        sent["timeout"] = timeout
        return _Resp()

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:ABC")
    monkeypatch.delenv("ADMIN_CHAT_ID", raising=False)
    monkeypatch.setattr(freshness.request, "urlopen", fake_urlopen)

    freshness._send_telegram("test message")

    payload = parse.parse_qs(sent["data"].decode("utf-8"))
    assert payload["chat_id"] == ["745125435"]
    assert payload["text"] == ["test message"]
    assert sent["timeout"] == 20
