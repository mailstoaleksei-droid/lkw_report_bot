import logging
import os
import time

import pythoncom
import win32com.client as win32

from excel_service import excel_global_lock

logger = logging.getLogger("lkw_report_bot.plan_update")

DEFAULT_PLAN_PATH = (
    r"C:\Users\Aleksei Samosvat\Groo GmbH\Intranet - Groo GmbH - Dokumente\Fahrer\Arbeitszeitplan der Fahrer - LKW\LKW_Fahrer_Plan.xlsb"
)

SHEET_NAME = "Fahrer-Arbeitsplan"
PLAN_FIRST_ROW = 4
PLAN_LKW_ID_COL = 1  # A
PLAN_GRID_FIRST_COL = 6  # F
PLAN_KW_ROW = 3

XL_NONE = -4142
ARROW_SYMBOL = "↔"


def _rgb_int(r: int, g: int, b: int) -> int:
    # Excel color integer (same as VBA RGB()).
    return int(r) + (int(g) * 256) + (int(b) * 65536)


TRANSFER_BLUE = _rgb_int(204, 238, 255)   # new transfer fill in VBA module
LEGACY_YELLOW = _rgb_int(204, 255, 255)   # old transfer fill left in some files


def _retry(callable_, *args, retries: int = 240, sleep_sec: float = 0.5, **kwargs):
    last = None
    for _ in range(retries):
        try:
            return callable_(*args, **kwargs)
        except Exception as e:
            last = e
            pythoncom.PumpWaitingMessages()
            time.sleep(sleep_sec)
    raise last


def _wait_excel_ready(excel, timeout_sec: int = 600) -> bool:
    started = time.time()
    while (time.time() - started) < timeout_sec:
        try:
            if bool(excel.Ready):
                return True
        except Exception:
            pass
        pythoncom.PumpWaitingMessages()
        time.sleep(0.5)
    return False


def _cleanup_legacy_transfer_fill(ws) -> int:
    # Removes stale yellow/blue transfer fill when the arrow symbol is absent.
    last_col = ws.Cells(PLAN_KW_ROW, ws.Columns.Count).End(-4159).Column  # xlToLeft
    last_row = ws.Cells(ws.Rows.Count, PLAN_LKW_ID_COL).End(-4162).Row  # xlUp
    if last_col < PLAN_GRID_FIRST_COL or last_row < PLAN_FIRST_ROW:
        return 0

    cleaned = 0
    for r in range(PLAN_FIRST_ROW, last_row + 1):
        lkw_id = str(ws.Cells(r, PLAN_LKW_ID_COL).Value or "").strip()
        if not lkw_id.startswith("L"):
            continue
        for c in range(PLAN_GRID_FIRST_COL, last_col + 1):
            cell = ws.Cells(r, c)
            txt = str(cell.Value or "")
            if ARROW_SYMBOL in txt:
                continue
            try:
                cur_color = int(cell.Interior.Color)
            except Exception:
                continue
            if cur_color in (TRANSFER_BLUE, LEGACY_YELLOW):
                cell.Interior.Pattern = XL_NONE
                cleaned += 1
    return cleaned


def run_plan_update(plan_path: str = "", macro_name: str = "") -> dict:
    """
    Open Plan workbook, run sync macro, save, close.
    Returns dict with execution metadata.
    """
    path = (plan_path or os.getenv("PLAN_FILE_PATH", "") or DEFAULT_PLAN_PATH).strip()
    if not path or not os.path.exists(path):
        raise FileNotFoundError(f"Plan file not found: {path}")

    # Prefer core macro with showMsg=False to avoid blocking MsgBox in headless mode.
    macro = (macro_name or os.getenv("PLAN_UPDATE_MACRO", "")).strip()
    macro_candidates = [macro] if macro else []
    macro_candidates.extend(["Sync_DataToPlan_FullRefresh", "Sync_RunAll_Aktualisiere"])

    with excel_global_lock(timeout_sec=900):
        pythoncom.CoInitialize()
        excel = None
        wb = None
        started = time.time()
        selected_macro = ""
        cleaned_cells = 0
        try:
            excel = win32.DispatchEx("Excel.Application")
            excel.Visible = False
            excel.DisplayAlerts = False
            excel.ScreenUpdating = False
            excel.EnableEvents = False
            excel.Interactive = False
            try:
                excel.AutomationSecurity = 1  # msoAutomationSecurityLow
            except Exception:
                pass

            wb = _retry(
                excel.Workbooks.Open,
                path,
                ReadOnly=False,
                UpdateLinks=0,
                AddToMru=False,
            )
            _retry(wb.Activate)

            last_error = None
            for candidate in macro_candidates:
                if not candidate:
                    continue
                try:
                    if candidate == "Sync_DataToPlan_FullRefresh":
                        _retry(excel.Run, f"'{wb.Name}'!{candidate}", False)
                    else:
                        _retry(excel.Run, f"'{wb.Name}'!{candidate}")
                    selected_macro = candidate
                    last_error = None
                    break
                except Exception as e:
                    last_error = e
                    logger.warning("Macro call failed (%s): %s", candidate, e)

            if not selected_macro:
                raise RuntimeError(f"No plan update macro succeeded: {last_error}")

            _wait_excel_ready(excel, timeout_sec=600)
            try:
                excel.CalculateUntilAsyncQueriesDone()
            except Exception:
                pass

            ws = wb.Worksheets(SHEET_NAME)
            cleaned_cells = _cleanup_legacy_transfer_fill(ws)
            _retry(wb.Save)

            duration_sec = round(time.time() - started, 2)
            return {
                "ok": True,
                "plan_path": path,
                "macro": selected_macro,
                "cleaned_cells": cleaned_cells,
                "duration_sec": duration_sec,
            }
        finally:
            if wb is not None:
                try:
                    _retry(wb.Close, SaveChanges=False, retries=30, sleep_sec=0.2)
                except Exception:
                    pass
            if excel is not None:
                try:
                    _retry(excel.Quit, retries=30, sleep_sec=0.2)
                except Exception:
                    pass
            pythoncom.CoUninitialize()
