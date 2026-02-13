"""
Central registry of report types.

To add a new report:
1. Create the VBA macro in Excel (modTelegramEntry.bas)
2. Add an entry to REPORT_TYPES below
3. Restart the bot

Each entry defines:
- name/description: bilingual display strings (en/ru)
- params: list of parameter definitions for the Mini App UI
- vba_macro: the VBA Sub name to call via COM
- named_ranges_in: mapping of Excel named ranges -> param IDs (set before macro)
- named_ranges_out: mapping of output format -> named range (read after macro)
"""

REPORT_TYPES = {
    "bericht": {
        "enabled": True,
        "icon": "report",
        "name": {
            "en": "Bericht (Trucks by Company)",
            "ru": "Отчёт (Грузовики по фирмам)",
            "de": "Bericht (LKW nach Firma)",
        },
        "description": {
            "en": "Weekly truck count by company (Container / Planen), 5 consecutive weeks",
            "ru": "Еженедельный подсчёт грузовиков по фирмам (Container / Planen), 5 недель подряд",
            "de": "Woechentliche LKW-Zaehlung pro Firma (Container / Planen), 5 Wochen",
        },
        "params": [
            {
                "id": "year",
                "type": "year",
                "label": {"en": "Year", "ru": "Год"},
                "min": 2024,
                "max": 2030,
            },
            {
                "id": "week",
                "type": "week",
                "label": {"en": "Week", "ru": "Неделя"},
                "min": 1,
                "max": 53,
            },
        ],
        "vba_macro": "GenerateAndExportReport_FromParams",
        "named_ranges_in": {
            "Report_Year": "year",
            "Report_Week": "week",
        },
        "named_ranges_out": {
            "xlsx": "Report_Out_XLSX",
            "pdf": "Report_Out_PDF",
        },
    },
    # Future reports go here, e.g.:
    # "fahrer_report": {
    #     "name": {"en": "Driver Schedule", "ru": "Расписание водителей"},
    #     ...
    # },
}

FUTURE_REPORTS = [
    {
        "id": "tankkarten",
        "enabled": False,
        "icon": "fuel",
        "name": {
            "en": "Fuel Cards",
            "ru": "Топливные карты",
            "de": "Tankkarten",
        },
        "description": {
            "en": "Coming soon",
            "ru": "Скоро будет доступно",
            "de": "Kommt bald",
        },
        "params": [],
    },
    {
        "id": "fahrer_zeiten",
        "enabled": False,
        "icon": "drivers",
        "name": {
            "en": "Driver Times",
            "ru": "Время водителей",
            "de": "Fahrerzeiten",
        },
        "description": {
            "en": "Coming soon",
            "ru": "Скоро будет доступно",
            "de": "Kommt bald",
        },
        "params": [],
    },
    {
        "id": "urlaub_plan",
        "enabled": False,
        "icon": "calendar",
        "name": {
            "en": "Vacation Plan",
            "ru": "План отпусков",
            "de": "Urlaubsplan",
        },
        "description": {
            "en": "Coming soon",
            "ru": "Скоро будет доступно",
            "de": "Kommt bald",
        },
        "params": [],
    },
]


def get_report_config(report_type: str) -> dict:
    """Return config for a report type, or raise KeyError."""
    if report_type not in REPORT_TYPES:
        raise KeyError(f"Unknown report type: {report_type!r}. Available: {list(REPORT_TYPES)}")
    return REPORT_TYPES[report_type]


def get_all_reports_api() -> list[dict]:
    """Return report list for Mini App API (safe for JSON serialization)."""
    result = []
    for key, cfg in REPORT_TYPES.items():
        result.append({
            "id": key,
            "enabled": cfg.get("enabled", True),
            "icon": cfg.get("icon", "report"),
            "name": cfg["name"],
            "description": cfg["description"],
            "params": cfg["params"],
        })
    result.extend(FUTURE_REPORTS)
    return result
