# excel_runner.py
import sys

from excel_service import run_report


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python excel_runner.py <year> <week>")
        return 2

    try:
        year = int(sys.argv[1])
        week = int(sys.argv[2])
    except ValueError:
        print("ERROR: year/week must be integers")
        return 2

    try:
        xlsx_path, pdf_path = run_report(year, week)
        print("XLSX:", xlsx_path)
        print("PDF :", pdf_path)
        return 0
    except Exception as e:
        print("ERROR:", repr(e))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
