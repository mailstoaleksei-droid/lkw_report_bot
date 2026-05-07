from datetime import date

import check_lkw_deadlines as deadlines


def test_parse_due_month_accepts_month_year_formats():
    assert deadlines.parse_due_month("10/2026") == date(2026, 10, 1)
    assert deadlines.parse_due_month("10.2026") == date(2026, 10, 1)
    assert deadlines.parse_due_month("2026-10") == date(2026, 10, 1)


def test_previous_month_start_handles_year_boundary():
    assert deadlines.previous_month_start(date(2026, 10, 1)) == date(2026, 9, 1)
    assert deadlines.previous_month_start(date(2026, 1, 1)) == date(2025, 12, 1)


def test_due_for_notification_matches_exact_notify_date():
    items = [
        deadlines.LkwDeadline(1, "L014", "GR-OO1515", "HU", date(2026, 8, 1), date(2026, 7, 1)),
        deadlines.LkwDeadline(2, "L001", "GR-OO1708", "SP", date(2027, 1, 1), date(2026, 12, 1)),
    ]

    due = deadlines.due_for_notification(items, date(2026, 7, 1))

    assert due == [items[0]]


def test_build_message_includes_truck_number_deadline_and_action():
    item = deadlines.LkwDeadline(14, "L014", "GR-OO1515", "HU", date(2026, 8, 1), date(2026, 7, 1))

    msg = deadlines.build_message([item], date(2026, 7, 1), test=True)

    assert msg.startswith("TEST")
    assert "GR-OO1515 (L014)" in msg
    assert "Termin: HU" in msg
    assert "Gueltig bis: 08/2026" in msg
    assert "neuen HU bis 08/2026 machen" in msg
