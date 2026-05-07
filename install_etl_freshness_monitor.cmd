@echo off
setlocal
cd /d "%~dp0"

set "TASK_NAME=LKW_Report_Bot_ETL_Freshness"
set "TASK_PREFIX=LKW_Report_Bot_ETL_Freshness_"
set "TASK_CMD=%~dp0run_etl_freshness_task.cmd"
for %%I in ("%~dp0.") do set "BASE_DIR_SHORT=%%~fsI"
if defined BASE_DIR_SHORT set "TASK_CMD_SHORT=%BASE_DIR_SHORT%\run_etl_freshness_task.cmd"
if not defined TASK_CMD_SHORT set "TASK_CMD_SHORT=%TASK_CMD%"

if not exist "%TASK_CMD%" (
    echo FAILED: Task command not found: %TASK_CMD%
    exit /b 1
)

echo Creating ETL freshness monitor task: %TASK_NAME%
echo Schedule: weekdays fixed checks after 2-hour ETL runs
echo Task command: %TASK_CMD_SHORT%

call :create_fixed_monitor "%TASK_NAME%" "08:45"
if errorlevel 1 exit /b 1

for %%H in (10 12 14 16) do (
    call :create_fixed_monitor "%TASK_PREFIX%%%H" "%%H:45"
    if errorlevel 1 exit /b 1
)

call :create_fixed_monitor "%TASK_PREFIX%18" "18:30"
if errorlevel 1 exit /b 1

echo Disabling old hourly freshness monitor tasks:
for %%H in (09 11 13 15 17) do (
    schtasks /Change /TN "%TASK_PREFIX%%%H" /DISABLE >nul 2>&1
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

:create_fixed_monitor
set "MONITOR_NAME=%~1"
set "MONITOR_START=%~2"
echo   %MONITOR_NAME% at %MONITOR_START%
schtasks /Create /F /TN "%MONITOR_NAME%" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST %MONITOR_START% ^
 /RL HIGHEST /TR "cmd.exe /c \"\"%TASK_CMD_SHORT%\"\"" >nul 2>&1
if errorlevel 1 (
    schtasks /Create /F /TN "%MONITOR_NAME%" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST %MONITOR_START% ^
     /RL LIMITED /TR "cmd.exe /c \"\"%TASK_CMD_SHORT%\"\"" >nul 2>&1
)
if errorlevel 1 (
    echo FAILED: Could not create ETL freshness monitor task %MONITOR_NAME%.
    exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set_etl_task_settings.ps1" -TaskName "%MONITOR_NAME%" >nul 2>&1
exit /b 0
