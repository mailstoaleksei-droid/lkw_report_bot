@echo off
setlocal
cd /d "%~dp0"

set "PY=%~dp0.venv\Scripts\python.exe"
set "SCRIPT=%~dp0check_driver_birthdays.py"

if not exist "%PY%" (
  echo FAILED: Python not found: %PY%
  exit /b 1
)
if not exist "%SCRIPT%" (
  echo FAILED: Script not found: %SCRIPT%
  exit /b 1
)

"%PY%" "%SCRIPT%"
set "RC=%errorlevel%"
endlocal
exit /b %RC%
