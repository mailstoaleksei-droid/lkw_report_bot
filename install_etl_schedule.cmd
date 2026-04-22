@echo off
setlocal
cd /d "%~dp0"

set "TASK_CMD=%~dp0run_etl_pipeline_task.cmd"
for %%I in ("%~dp0.") do set "BASE_DIR_SHORT=%%~fsI"
if defined BASE_DIR_SHORT set "TASK_CMD_SHORT=%BASE_DIR_SHORT%\run_etl_pipeline_task.cmd"
if not defined TASK_CMD_SHORT set "TASK_CMD_SHORT=%TASK_CMD%"

set "TASK_DAY=LKW_Report_Bot_ETL_DayHourly"
set "TASK_NIGHT=LKW_Report_Bot_ETL_Night3h"
set "TASK_WATCH=LKW_Report_Bot_ETL_OnSourceChange"

if not exist "%TASK_CMD%" (
    echo FAILED: Task command not found: %TASK_CMD%
    exit /b 1
)

echo Installing ETL schedules:
echo   1^) Weekdays: 07:00-18:00 every hour
echo   2^) Night periodic ETL: disabled
echo Task command: %TASK_CMD_SHORT%

echo Creating day task: %TASK_DAY%
schtasks /Create /F /TN "%TASK_DAY%" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 07:00 /RI 60 /DU 11:59 ^
 /RL HIGHEST /TR "cmd.exe /c \"\"%TASK_CMD_SHORT%\"\"" >nul 2>&1
if errorlevel 1 (
    schtasks /Create /F /TN "%TASK_DAY%" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 07:00 /RI 60 /DU 11:59 ^
     /RL LIMITED /TR "cmd.exe /c \"\"%TASK_CMD_SHORT%\"\"" >nul 2>&1
)
if errorlevel 1 (
    echo FAILED: Could not create day ETL task.
    exit /b 1
)

echo Disabling night task if it exists: %TASK_NIGHT%
schtasks /Change /TN "%TASK_NIGHT%" /DISABLE >nul 2>&1
if errorlevel 1 (
    echo INFO: Night ETL task not found or could not be changed.
) else (
    echo OK: Night ETL task disabled.
)

echo Disabling source-change ETL task for strict hourly schedule: %TASK_WATCH%
schtasks /Change /TN "%TASK_WATCH%" /DISABLE >nul 2>&1
if errorlevel 1 (
    echo INFO: Source-change ETL task not found or could not be changed.
) else (
    echo OK: Source-change ETL task disabled.
)

echo Applying resilient task settings: allow battery starts, start when available, wake to run
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set_etl_task_settings.ps1" -TaskName "%TASK_DAY%"
if errorlevel 1 (
    echo WARN: Could not apply resilient task settings. Run this script as administrator if needed.
)

echo OK: ETL day task created.
echo ---
schtasks /Query /TN "%TASK_DAY%" /FO LIST /V

echo Running ETL once now...
cmd /c "%TASK_CMD%"
set "RC=%errorlevel%"
echo ETL one-shot exit code: %RC%

endlocal
exit /b %RC%
