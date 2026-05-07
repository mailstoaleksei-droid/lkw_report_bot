from datetime import date
from urllib import parse

import check_driver_birthdays as birthdays


def test_parse_birth_date_accepts_sheet_date_formats():
    assert birthdays.parse_birth_date("12/02/2002") == date(2002, 2, 12)
    assert birthdays.parse_birth_date("12.02.2002") == date(2002, 2, 12)
    assert birthdays.parse_birth_date("2002-02-12") == date(2002, 2, 12)


def test_age_on_birthday_and_before_birthday():
    birth_date = date(1990, 5, 7)

    assert birthdays.age_on(birth_date, date(2026, 5, 7)) == 36
    assert birthdays.age_on(birth_date, date(2026, 5, 6)) == 35


def test_build_message_includes_phone_age_and_lkw():
    msg = birthdays.build_message(
        [
            birthdays.DriverBirthday(
                driver_db_id=1,
                external_id="F003",
                full_name="Aliaksandr Khrameyeu",
                company_name="UAB Groo Transport",
                phone="+375447900045",
                birth_date=date(1963, 5, 7),
                age_years=63,
                trucks=("L123 (ABC123)",),
                iso_year=2026,
                iso_week=19,
            )
        ],
        date(2026, 5, 7),
    )

    assert "F003 - Aliaksandr Khrameyeu" in msg
    assert "Telefon: +375447900045" in msg
    assert "Geburtsdatum: 07/05/1963" in msg
    assert "Alter: 63 Jahre" in msg
    assert "LKW W19/2026: L123 (ABC123)" in msg


def test_send_telegram_uses_driver_birthday_chat_id(monkeypatch):
    sent = {}

    class _Resp:
        def read(self):
            return b"{}"

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    def fake_urlopen(req, timeout):
        sent["data"] = req.data
        sent["timeout"] = timeout
        return _Resp()

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:ABC")
    monkeypatch.setenv("DRIVER_BIRTHDAY_NOTIFY_CHAT_ID", "745125435")
    monkeypatch.setattr(birthdays.request, "urlopen", fake_urlopen)

    birthdays._send_telegram("birthday")

    payload = parse.parse_qs(sent["data"].decode("utf-8"))
    assert payload["chat_id"] == ["745125435"]
    assert payload["text"] == ["birthday"]
    assert sent["timeout"] == 20
