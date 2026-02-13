@echo off
setlocal
cd /d "%~dp0"

set "TASK_BOOT=LKW_Report_Bot_OnLogon"
set "TASK_WATCHDOG=LKW_Report_Bot_Watchdog"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "STARTUP_CMD=%STARTUP_DIR%\LKW_Report_Bot_Autostart.cmd"

echo Creating scheduled tasks...

set "BOOT_OK=0"
set "WATCHDOG_OK=0"

schtasks /Create /F /TN "%TASK_BOOT%" /SC ONLOGON /RL HIGHEST /TR "wscript.exe \"%~dp0run_silent.vbs\"" >nul 2>&1
if not errorlevel 1 (
    set "BOOT_OK=1"
) else (
    schtasks /Create /F /TN "%TASK_BOOT%" /SC ONLOGON /RL LIMITED /TR "wscript.exe \"%~dp0run_silent.vbs\"" >nul 2>&1
    if not errorlevel 1 set "BOOT_OK=1"
)

if "%BOOT_OK%"=="0" (
    echo Scheduler task create failed. Falling back to Startup folder...
    if not exist "%STARTUP_DIR%" mkdir "%STARTUP_DIR%" >nul 2>&1
    > "%STARTUP_CMD%" echo @echo off
    >> "%STARTUP_CMD%" echo start "" wscript.exe "%~dp0run_silent.vbs"
    if exist "%STARTUP_CMD%" (
        set "BOOT_OK=1"
        echo Startup fallback created: %STARTUP_CMD%
    )
)

schtasks /Create /F /TN "%TASK_WATCHDOG%" /SC MINUTE /MO 5 /RL HIGHEST /TR "cmd.exe /c \"\"%~dp0watchdog.cmd\"\"" >nul 2>&1
if not errorlevel 1 (
    set "WATCHDOG_OK=1"
) else (
    schtasks /Create /F /TN "%TASK_WATCHDOG%" /SC MINUTE /MO 5 /RL LIMITED /TR "cmd.exe /c \"\"%~dp0watchdog.cmd\"\"" >nul 2>&1
    if not errorlevel 1 set "WATCHDOG_OK=1"
)

if "%BOOT_OK%"=="1" (
    echo OK: Autostart configured.
) else (
    echo FAILED: Could not configure autostart.
)

if "%WATCHDOG_OK%"=="1" (
    echo OK: Watchdog task configured.
) else (
    echo WARN: Could not configure watchdog task due permissions or policy.
)

echo Running immediate watchdog check...
cmd /c "%~dp0watchdog.cmd"

if "%BOOT_OK%"=="0" exit /b 1
echo Done.
endlocal
