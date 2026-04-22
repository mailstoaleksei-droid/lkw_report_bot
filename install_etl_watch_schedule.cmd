@echo off
setlocal
cd /d "%~dp0"

set "TASK_NAME=LKW_Report_Bot_ETL_OnSourceChange"
set "TASK_CMD=%~dp0run_etl_watch_task.cmd"
for %%I in ("%~dp0.") do set "BASE_DIR_SHORT=%%~fsI"
if defined BASE_DIR_SHORT set "TASK_CMD_SHORT=%BASE_DIR_SHORT%\run_etl_watch_task.cmd"
if not defined TASK_CMD_SHORT set "TASK_CMD_SHORT=%TASK_CMD%"

if not exist "%TASK_CMD%" (
    echo FAILED: Task command not found: %TASK_CMD%
    exit /b 1
)

echo Creating ETL on-source-change task: %TASK_NAME%
echo Schedule: every 2 minutes, 07:00-18:00
echo Task command: %TASK_CMD_SHORT%

schtasks /Create /F /TN "%TASK_NAME%" /SC DAILY /ST 07:00 /RI 2 /DU 11:00 ^
 /RL HIGHEST /TR "cmd.exe /c \"\"%TASK_CMD_SHORT%\"\"" >nul 2>&1

if errorlevel 1 (
    schtasks /Create /F /TN "%TASK_NAME%" /SC DAILY /ST 07:00 /RI 2 /DU 11:00 ^
     /RL LIMITED /TR "cmd.exe /c \"\"%TASK_CMD_SHORT%\"\"" >nul 2>&1
)

if errorlevel 1 (
    echo FAILED: Could not create ETL watch task.
    exit /b 1
)

echo OK: ETL watch task created.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set_etl_task_settings.ps1" -TaskName "%TASK_NAME%"
if errorlevel 1 (
    echo WARN: Could not apply resilient task settings. Run this script as administrator if needed.
)
schtasks /Query /TN "%TASK_NAME%" /FO LIST /V

echo Running watcher once now...
cmd /c "%TASK_CMD%"
set "RC=%errorlevel%"
echo Watcher one-shot exit code: %RC%

endlocal
exit /b %RC%
