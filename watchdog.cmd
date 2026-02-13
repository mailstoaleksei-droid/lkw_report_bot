@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0watchdog.ps1"
set "RC=%errorlevel%"
endlocal
exit /b %RC%
