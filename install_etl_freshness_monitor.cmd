@echo off
setlocal
cd /d "%~dp0"

set "TASK_NAME=LKW_Report_Bot_ETL_Freshness"
set "TASK_CMD=%~dp0run_etl_freshness_task.cmd"
for %%I in ("%~dp0.") do set "BASE_DIR_SHORT=%%~fsI"
if defined BASE_DIR_SHORT set "TASK_CMD_SHORT=%BASE_DIR_SHORT%\run_etl_freshness_task.cmd"
if not defined TASK_CMD_SHORT set "TASK_CMD_SHORT=%TASK_CMD%"

if not exist "%TASK_CMD%" (
    echo FAILED: Task command not found: %TASK_CMD%
    exit /b 1
)

echo Creating ETL freshness monitor task: %TASK_NAME%
echo Schedule: weekdays every 30 minutes, 07:00-18:00
echo Task command: %TASK_CMD_SHORT%

schtasks /Create /F /TN "%TASK_NAME%" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 07:00 /RI 30 /DU 11:59 ^
 /RL HIGHEST /TR "cmd.exe /c \"\"%TASK_CMD_SHORT%\"\"" >nul 2>&1

if errorlevel 1 (
    schtasks /Create /F /TN "%TASK_NAME%" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 07:00 /RI 30 /DU 11:59 ^
     /RL LIMITED /TR "cmd.exe /c \"\"%TASK_CMD_SHORT%\"\"" >nul 2>&1
)

if errorlevel 1 (
    echo FAILED: Could not create ETL freshness monitor task.
    exit /b 1
)

echo OK: ETL freshness monitor task created.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set_etl_task_settings.ps1" -TaskName "%TASK_NAME%"
if errorlevel 1 (
    echo WARN: Could not apply resilient task settings. Run this script as administrator if needed.
)
schtasks /Query /TN "%TASK_NAME%" /FO LIST /V

echo Running monitor once now...
cmd /c "%TASK_CMD%"
set "RC=%errorlevel%"
echo Monitor one-shot exit code: %RC%

endlocal
exit /b %RC%
