@echo off
setlocal
cd /d "%~dp0"

echo [1/4] Refreshing Mini App tunnel URL...
".venv\Scripts\python.exe" "refresh_tunnel.py" --port 8443
if errorlevel 1 (
  echo FAILED: tunnel refresh
  exit /b 1
)

echo [2/4] Sync Telegram profile and Open App button...
".venv\Scripts\python.exe" "sync_telegram_profile.py"
if errorlevel 1 (
  echo FAILED: telegram profile sync
  exit /b 1
)

echo [3/4] Restart bot...
cmd /c stop_bot.cmd >nul 2>&1
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "Start-Process -FilePath 'wscript.exe' -ArgumentList 'run_silent.vbs'" >nul

echo [4/4] Done.
endlocal
