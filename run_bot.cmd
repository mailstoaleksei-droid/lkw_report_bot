@echo off
setlocal
cd /d "%~dp0"

set "STOP_FLAG=%~dp0stop_bot.flag"
set "RESTART_DELAY_SEC=15"

if exist "%STOP_FLAG%" del /q "%STOP_FLAG%" >nul 2>&1

echo ==== %date% %time% SUPERVISOR START ====>> "%~dp0bot_console.log"
echo CWD=%cd%>> "%~dp0bot_console.log"
echo PY=%~dp0.venv\Scripts\python.exe>> "%~dp0bot_console.log"
echo EXISTS_PY=>> "%~dp0bot_console.log"
if exist "%~dp0.venv\Scripts\python.exe" (echo YES>> "%~dp0bot_console.log") else (echo NO>> "%~dp0bot_console.log")

echo PY_VERSION=>> "%~dp0bot_console.log"
"%~dp0.venv\Scripts\python.exe" -V >> "%~dp0bot_console.log" 2>&1

echo ENV_FILE=>> "%~dp0bot_console.log"
if exist "%~dp0.env" (echo FOUND>> "%~dp0bot_console.log") else (echo NOT_FOUND>> "%~dp0bot_console.log")

echo DIR_LIST=>> "%~dp0bot_console.log"
dir "%~dp0" >> "%~dp0bot_console.log" 2>&1

:LOOP
if exist "%STOP_FLAG%" goto END

echo ==== %date% %time% BOT START ====>> "%~dp0bot_console.log"
echo TUNNEL_REFRESH=>> "%~dp0bot_console.log"
"%~dp0.venv\Scripts\python.exe" "%~dp0refresh_tunnel.py" --port 8443 >> "%~dp0bot_console.log" 2>&1
if errorlevel 1 (
    echo ==== %date% %time% TUNNEL REFRESH FAILED, KEEP CURRENT WEBAPP_URL ====>> "%~dp0bot_console.log"
)

echo PREFLIGHT_CHECK=>> "%~dp0bot_console.log"
"%~dp0.venv\Scripts\python.exe" "%~dp0preflight_check.py" >> "%~dp0bot_console.log" 2>&1
if errorlevel 1 (
    echo ==== %date% %time% PREFLIGHT FAILED, RETRY IN 30s ====>> "%~dp0bot_console.log"
    timeout /t 30 /nobreak >nul
    goto LOOP
)

"%~dp0.venv\Scripts\python.exe" "%~dp0bot.py" >> "%~dp0bot_console.log" 2>&1
set "BOT_EXIT_CODE=%errorlevel%"
echo ==== %date% %time% BOT EXIT (code=%BOT_EXIT_CODE%), RESTART IN %RESTART_DELAY_SEC%s ====>> "%~dp0bot_console.log"

if exist "%STOP_FLAG%" goto END
timeout /t %RESTART_DELAY_SEC% /nobreak >nul
goto LOOP

:END
echo ==== %date% %time% SUPERVISOR STOP ====>> "%~dp0bot_console.log"
endlocal
