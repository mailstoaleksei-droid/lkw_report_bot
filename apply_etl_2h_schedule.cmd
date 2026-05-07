@echo off
setlocal
cd /d "%~dp0"

set "TASK_CMD=%~dp0run_etl_pipeline_task.cmd"
for %%I in ("%~dp0.") do set "BASE_DIR_SHORT=%%~fsI"
if defined BASE_DIR_SHORT set "TASK_CMD_SHORT=%BASE_DIR_SHORT%\run_etl_pipeline_task.cmd"
if not defined TASK_CMD_SHORT set "TASK_CMD_SHORT=%TASK_CMD%"

set "TASK_DAY=LKW_Report_Bot_ETL_DayHourly"
set "TASK_HOUR_PREFIX=LKW_Report_Bot_ETL_Hourly_"

if not exist "%TASK_CMD%" (
    echo FAILED: Task command not found: %TASK_CMD%
    exit /b 1
)

echo Applying ETL schedule: weekdays every 2 hours at :30

call :create_fixed_task "%TASK_DAY%" "07:30"
if errorlevel 1 exit /b 1

for %%H in (09 11 13 15 17) do (
    call :create_fixed_task "%TASK_HOUR_PREFIX%%%H" "%%H:30"
    if errorlevel 1 exit /b 1
)

for %%H in (08 10 12 14 16 18) do (
    schtasks /Change /TN "%TASK_HOUR_PREFIX%%%H" /DISABLE >nul 2>&1
)

echo OK: ETL 2-hour schedule applied without running ETL now.
schtasks /Query /TN "%TASK_DAY%" /FO LIST /V

endlocal
exit /b 0

:create_fixed_task
set "TASK_NAME=%~1"
set "TASK_START=%~2"
echo   %TASK_NAME% at %TASK_START%
schtasks /Create /F /TN "%TASK_NAME%" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST %TASK_START% ^
 /RL HIGHEST /TR "cmd.exe /c \"\"%TASK_CMD_SHORT%\"\"" >nul 2>&1
if errorlevel 1 (
    schtasks /Create /F /TN "%TASK_NAME%" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST %TASK_START% ^
     /RL LIMITED /TR "cmd.exe /c \"\"%TASK_CMD_SHORT%\"\"" >nul 2>&1
)
if errorlevel 1 (
    echo FAILED: Could not create ETL task %TASK_NAME%.
    exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set_etl_task_settings.ps1" -TaskName "%TASK_NAME%" >nul 2>&1
exit /b 0
