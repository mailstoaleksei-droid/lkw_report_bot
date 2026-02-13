import os
import csv
import time
import shutil
import threading
import contextlib
import msvcrt
import subprocess
import logging
import uuid

import pythoncom
import win32com.client as win32

from report_config import get_report_config

logger = logging.getLogger("lkw_report_bot.excel")

# Excel/COM common transient errors
RPC_E_CALL_REJECTED = -2147418111       # "Call was rejected by callee"
RPC_E_REMOTE_PROC_FAILED = -2147023170  # 0x800706BE "The remote procedure call failed"
RPC_E_SERVERCALL_RETRYLATER = -2147418112  # 0x8001010A
RPC_E_SERVER_UNAVAILABLE = -2147023174  # 0x800706BA "The RPC server is unavailable"

# One global lock file in %TEMP% (prevents parallel Excel automation across processes)
LOCK_PATH = os.path.join(os.environ.get("TEMP", r"C:\Windows\Temp"), "lkw_report_bot_excel.lock")

# Extra in-process lock (prevents parallel runs within the same Python process)
_THREAD_LOCK = threading.Lock()

# Track orphaned Excel processes
_EXCEL_PIDS = set()


def _kill_hidden_excel_processes():
    """Kill hidden/background EXCEL.EXE processes (window title is empty/N/A)."""
    try:
        result = subprocess.run(
            ['tasklist', '/v', '/fo', 'csv', '/fi', 'IMAGENAME eq EXCEL.EXE'],
            capture_output=True,
            text=True,
            timeout=10,
        )
        lines = [line for line in result.stdout.splitlines() if line.strip()]
        if len(lines) <= 1:
            return

        killed = 0
        reader = csv.reader(lines)
        header = next(reader, None)
        if not header:
            return

        for row in reader:
            if len(row) < 9:
                continue
            pid = row[1].strip()
            window_title = row[-1].strip()
            if window_title in ("N/A", "", "HardwareMonitorWindow") and pid.isdigit():
                try:
                    subprocess.run(
                        ['taskkill', '/F', '/PID', pid],
                        capture_output=True,
                        text=True,
                        timeout=10,
                    )
                    killed += 1
                except Exception:
                    pass

        if killed:
            logger.warning("Killed hidden Excel process(es): %s", killed)
    except Exception as e:
        logger.debug(f"Could not kill hidden Excel processes: {e}")


def _kill_orphaned_excel():
    """Kill Excel processes that might be stuck from previous runs."""
    try:
        _kill_hidden_excel_processes()

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
                f.seek(0)
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
        (str(RPC_E_SERVER_UNAVAILABLE) in msg) or ("rpc server is unavailable" in msg.lower()) or
        ("0x800706BE" in msg) or
        (str(RPC_E_SERVERCALL_RETRYLATER) in msg) or ("servercall retrylater" in msg.lower())
    )


def _is_retryable_error(e: Exception) -> bool:
    msg = str(e).lower()
    if _is_transient_com_error(e):
        return True
    if "cannot access the file" in msg:
        return True
    if "being used by another process" in msg:
        return True
    return False


def _retry(callable_, *args, retries: int = 120, sleep_sec: float = 0.5, **kwargs):
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


def _wait_excel_ready(excel, timeout_sec: int = 120) -> bool:
    """Wait until Excel COM reports Ready=True."""
    started = time.time()
    while (time.time() - started) < timeout_sec:
        try:
            if bool(excel.Ready):
                return True
        except Exception:
            # Ignore transient COM errors while Excel is busy.
            pass
        pythoncom.PumpWaitingMessages()
        time.sleep(0.5)
    return False


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

    # First try configured fixed path (for backward compatibility),
    # then fall back to unique file names to avoid lock/name collisions.
    root, ext = os.path.splitext(bot_copy)
    unique_suffix = f"{int(time.time())}_{os.getpid()}_{uuid.uuid4().hex[:8]}"
    candidates = [bot_copy, f"{root}_{unique_suffix}{ext or '.xlsm'}"]

    last_err = None
    for candidate in candidates:
        try:
            shutil.copy2(src_path, candidate)
            return candidate
        except Exception as e:
            last_err = e
            logger.warning("Failed to copy workbook to %s: %s", candidate, e)
            continue

    logger.warning("Falling back to source workbook due to copy errors: %s", last_err)
    return src_path


def _run_once(report_type: str, year: int, week: int) -> tuple[str, str]:
    """
    One Excel COM run (single attempt). Excel instance is created and destroyed here.
    Uses report_config to determine which macro to run and which named ranges to use.
    """
    cfg = get_report_config(report_type)

    source_excel_file = os.environ.get("EXCEL_FILE_PATH", "").strip()
    if not source_excel_file or not os.path.exists(source_excel_file):
        raise FileNotFoundError(f"EXCEL_FILE_PATH not set or file not found: {source_excel_file}")

    excel_file = _expand_and_copy_source_workbook(source_excel_file)

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

        # Set report type named range (for VBA dispatcher)
        try:
            _retry(lambda: wb.Names("Report_Type").RefersToRange.__setattr__("Value", report_type))
        except Exception:
            pass  # Report_Type range may not exist yet in older workbooks

        # Set parameters via named ranges (from config)
        param_values = {"year": int(year), "week": int(week)}
        for range_name, param_id in cfg["named_ranges_in"].items():
            val = param_values.get(param_id)
            if val is not None:
                _retry(lambda rn=range_name, v=val: wb.Names(rn).RefersToRange.__setattr__("Value", v))

        # Run macro (entry point from config)
        macro_name = cfg["vba_macro"]
        _retry(excel.Run, f"'{wb.Name}'!{macro_name}")
        _wait_excel_ready(excel, timeout_sec=180)

        # Read output paths via named ranges (from config)
        out_ranges = cfg["named_ranges_out"]
        xlsx_path = _retry(
            lambda: str(wb.Names(out_ranges["xlsx"]).RefersToRange.Value),
            retries=360,
            sleep_sec=0.5,
        )
        pdf_path = _retry(
            lambda: str(wb.Names(out_ranges["pdf"]).RefersToRange.Value),
            retries=360,
            sleep_sec=0.5,
        )

        # If VBA wrote an explicit error into named range, propagate it to Python logs/chat.
        last_error = ""
        try:
            last_error = str(_retry(lambda: wb.Names("Report_LastError").RefersToRange.Value)).strip()
        except Exception:
            # Ignore missing named range, but keep normal output checks below.
            last_error = ""
        if last_error:
            raise RuntimeError(f"Excel macro error: {last_error}")

        if not xlsx_path or not pdf_path:
            raise RuntimeError(f"No output paths returned from Excel ({out_ranges}).")

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

        # Cleanup temporary workbook copy (if used)
        try:
            if excel_file and excel_file != source_excel_file and os.path.exists(excel_file):
                os.remove(excel_file)
        except Exception:
            pass


def run_report(report_type: str = "bericht", year: int = 0, week: int = 0) -> tuple[str, str]:
    """
    Public entry:
    - Enforces global single-run lock (no parallel Excel between processes)
    - Retries WHOLE run (restarts Excel) on transient COM/RPC failures

    Args:
        report_type: key from REPORT_TYPES config (default: "bericht")
        year: report year parameter
        week: report week parameter
    """
    with _THREAD_LOCK:
        with excel_global_lock(timeout_sec=300):
            last = None
            for attempt in range(1, 4):  # 3 attempts
                try:
                    # Clean up stuck Excel processes before starting
                    logger.warning(f"Attempt {attempt}/3 - cleaning orphaned/hidden Excel processes")
                    _kill_orphaned_excel()
                    time.sleep(1.0)

                    logger.info(f"Running report: type={report_type}, year={year}, week={week}, attempt={attempt}")
                    return _run_once(report_type, year, week)
                except Exception as e:
                    last = e
                    logger.warning(f"Report generation failed (attempt {attempt}): {e}")
                    if _is_retryable_error(e):
                        time.sleep(1.0 * attempt)
                        continue
                    raise
            raise last
