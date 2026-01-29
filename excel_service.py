import os
import time
import shutil
import threading
import contextlib
import msvcrt
import subprocess
import logging

import pythoncom
import win32com.client as win32
from dotenv import load_dotenv

logger = logging.getLogger("lkw_report_bot.excel")

load_dotenv(override=True)

# Excel/COM common transient errors
RPC_E_CALL_REJECTED = -2147418111       # "Call was rejected by callee"
RPC_E_REMOTE_PROC_FAILED = -2147023170  # 0x800706BE "The remote procedure call failed"
RPC_E_SERVERCALL_RETRYLATER = -2147418112  # 0x8001010A

# One global lock file in %TEMP% (prevents parallel Excel automation across processes)
LOCK_PATH = os.path.join(os.environ.get("TEMP", r"C:\Windows\Temp"), "lkw_report_bot_excel.lock")

# Extra in-process lock (prevents parallel runs within the same Python process)
_THREAD_LOCK = threading.Lock()

# Track orphaned Excel processes
_EXCEL_PIDS = set()


def _kill_orphaned_excel():
    """Kill Excel processes that might be stuck from previous runs."""
    try:
        # Use taskkill to terminate any Excel processes started by this bot
        # This is a safety measure for stuck COM processes
        result = subprocess.run(
            ['taskkill', '/F', '/IM', 'EXCEL.EXE', '/FI', 'STATUS eq NOT RESPONDING'],
            capture_output=True,
            text=True,
            timeout=10
        )
        if 'SUCCESS' in result.stdout:
            logger.warning("Killed non-responding Excel process(es)")
    except Exception as e:
        logger.debug(f"Could not check for orphaned Excel: {e}")


@contextlib.contextmanager
def excel_global_lock(timeout_sec: int = 300):
    """
    Prevents parallel Excel automation across processes using a file lock in %TEMP%.
    """
    os.makedirs(os.path.dirname(LOCK_PATH), exist_ok=True)
    f = open(LOCK_PATH, "a+b")
    try:
        start = time.time()
        while True:
            try:
                # lock 1 byte
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
                break
            except OSError:
                if time.time() - start > timeout_sec:
                    raise TimeoutError(f"Excel lock timeout after {timeout_sec}s: {LOCK_PATH}")
                time.sleep(0.5)
        yield
    finally:
        try:
            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
        except Exception:
            pass
        try:
            f.close()
        except Exception:
            pass


def _is_transient_com_error(e: Exception) -> bool:
    msg = str(e)
    return (
        (str(RPC_E_CALL_REJECTED) in msg) or ("Call was rejected by callee" in msg) or
        (str(RPC_E_REMOTE_PROC_FAILED) in msg) or ("The remote procedure call failed" in msg) or
        ("0x800706BE" in msg) or
        (str(RPC_E_SERVERCALL_RETRYLATER) in msg) or ("servercall retrylater" in msg.lower())
    )


def _retry(callable_, *args, retries: int = 60, sleep_sec: float = 0.5, **kwargs):
    last = None
    for _ in range(retries):
        try:
            return callable_(*args, **kwargs)
        except Exception as e:
            last = e
            if _is_transient_com_error(e):
                pythoncom.PumpWaitingMessages()
                time.sleep(sleep_sec)
                continue
            raise
    raise last


def _expand_and_copy_source_workbook(src_path: str) -> str:
    """
    Copies original XLSM into EXCEL_BOT_COPY (usually %TEMP%)
    to avoid collisions with users opening the main file.
    """
    bot_copy = os.path.expandvars(os.environ.get("EXCEL_BOT_COPY", "")).strip()
    if not bot_copy:
        return src_path

    dst_dir = os.path.dirname(bot_copy)
    if dst_dir:
        os.makedirs(dst_dir, exist_ok=True)

    try:
        shutil.copy2(src_path, bot_copy)
        return bot_copy
    except PermissionError:
        # Если исходный файл открыт и копирование заблокировано, работаем с оригиналом.
        return src_path
    except Exception:
        # Любая другая ошибка — тоже fallback к оригиналу.
        return src_path


def _run_once(year: int, week: int) -> tuple[str, str]:
    """
    One Excel COM run (single attempt). Excel instance is created and destroyed here.
    """
    excel_file = os.environ.get("EXCEL_FILE_PATH", "").strip()
    if not excel_file or not os.path.exists(excel_file):
        raise FileNotFoundError(f"EXCEL_FILE_PATH not set or file not found: {excel_file}")

    excel_file = _expand_and_copy_source_workbook(excel_file)

    pythoncom.CoInitialize()
    excel = None
    wb = None
    try:
        excel = win32.DispatchEx("Excel.Application")

        # Headless / stable COM settings
        excel.Visible = False
        excel.DisplayAlerts = False
        excel.ScreenUpdating = False
        excel.EnableEvents = False
        excel.Interactive = False

        # Disable macro security prompts (best effort)
        try:
            excel.AutomationSecurity = 1  # msoAutomationSecurityLow
        except Exception:
            pass

        pythoncom.PumpWaitingMessages()
        time.sleep(0.2)

        # Open workbook (NOT ReadOnly: writing named ranges is more reliable)
        wb = _retry(
            excel.Workbooks.Open,
            excel_file,
            ReadOnly=False,
            UpdateLinks=0,
            AddToMru=False,
        )

        # Ensure workbook is active context for Run
        _retry(lambda: wb.Activate())

        # Set parameters (named ranges)
        _retry(lambda: wb.Names("Report_Year").RefersToRange.__setattr__("Value", int(year)))
        _retry(lambda: wb.Names("Report_Week").RefersToRange.__setattr__("Value", int(week)))

        # Run macro (entry point)
        _retry(excel.Run, f"'{wb.Name}'!GenerateAndExportReport_FromParams")

        # Read output paths (named ranges)
        xlsx_path = _retry(lambda: str(wb.Names("Report_Out_XLSX").RefersToRange.Value))
        pdf_path = _retry(lambda: str(wb.Names("Report_Out_PDF").RefersToRange.Value))

        if not xlsx_path or not pdf_path:
            raise RuntimeError("No output paths returned from Excel (Report_Out_XLSX/PDF are empty).")

        return xlsx_path, pdf_path

    finally:
        # Close workbook and Excel cleanly
        if wb is not None:
            try:
                _retry(wb.Close, SaveChanges=False, retries=10, sleep_sec=0.2)
            except Exception:
                pass
        if excel is not None:
            try:
                _retry(excel.Quit, retries=10, sleep_sec=0.2)
            except Exception:
                pass
        pythoncom.CoUninitialize()


def run_report(year: int, week: int) -> tuple[str, str]:
    """
    Public entry:
    - Enforces global single-run lock (no parallel Excel between processes)
    - Retries WHOLE run (restarts Excel) on transient COM/RPC failures
    """
    with _THREAD_LOCK:
        with excel_global_lock(timeout_sec=300):
            last = None
            for attempt in range(1, 4):  # 3 attempts
                try:
                    # Clean up stuck Excel processes before starting
                    if attempt > 1:
                        logger.warning(f"Attempt {attempt}/3 - killing orphaned Excel processes")
                        _kill_orphaned_excel()
                        time.sleep(1.0)

                    logger.info(f"Running report: year={year}, week={week}, attempt={attempt}")
                    return _run_once(year, week)
                except Exception as e:
                    last = e
                    logger.warning(f"Report generation failed (attempt {attempt}): {e}")
                    if _is_transient_com_error(e):
                        time.sleep(1.0 * attempt)
                        continue
                    raise
            raise last
