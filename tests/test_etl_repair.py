from datetime import date
from decimal import Decimal

from openpyxl import Workbook

from etl_xlsm_to_postgres import extract_repairs


def _build_repair_sheet():
    wb = Workbook()
    ws = wb.active
    ws.title = "Repair"

    headers = [
        "Year",
        "Month",
        "Week",
        "Date Invoice",
        "Truck",
        "Name",
        "Total Price",
        "Invoice",
        "Seller",
        "Byuer",
        "Kategorie",
    ]
    for idx, value in enumerate(headers, start=1):
        ws.cell(row=2, column=idx, value=value)

    ws.append([2026, 3, 14, date(2026, 3, 31), "EX DE-FN400", "wash service", 85.71, "V-RE002079", "Wash GmbH", "Groo GmbH", "Wash"])
    ws.append([2026, 4, 15, date(2026, 4, 7), "GR-OO2245", "CP Comfort Plus LKW neu", "164,61", "7601077285", "MAN Truck", "Groo GmbH", "Service"])
    return wb


def test_extract_repairs_normalizes_renamed_truck_numbers():
    rows = extract_repairs(_build_repair_sheet())

    assert len(rows) == 2
    assert rows[0].truck_number == "GR-OO2206"
    assert rows[0].original_truck_number == "EX DE-FN400"
    assert rows[0].total_price == Decimal("85.71")


def test_extract_repairs_keeps_current_truck_numbers_and_buyer_typo_column():
    rows = extract_repairs(_build_repair_sheet())
    current = next(row for row in rows if row.truck_number == "GR-OO2245")

    assert current.invoice_date == date(2026, 4, 7)
    assert current.total_price == Decimal("164.61")
    assert current.buyer == "Groo GmbH"
