@echo off
setlocal
cd /d "%~dp0"

echo === LKW Bot: preflight ===
python preflight_check.py
if errorlevel 1 (
  echo FAILED: preflight_check.py
  exit /b 1
)

echo === LKW Bot: py_compile ===
python -m py_compile bot.py scheduler.py web_server.py report_config.py excel_service.py excel_runner.py preflight_check.py
if errorlevel 1 (
  echo FAILED: py_compile
  exit /b 1
)

echo === LKW Bot: pytest ===
python -m pytest -q
if errorlevel 1 (
  echo FAILED: pytest
  exit /b 1
)

echo === ALL CHECKS PASSED ===
endlocal
exit /b 0
