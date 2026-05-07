@echo off
setlocal
cd /d "%~dp0"

set "TASK_NAME=LKW_Report_Bot_Driver_Birthdays"
set "TASK_CMD=%~dp0run_driver_birthdays_task.cmd"
for %%I in ("%~dp0.") do set "BASE_DIR_SHORT=%%~fsI"
if defined BASE_DIR_SHORT set "TASK_CMD_SHORT=%BASE_DIR_SHORT%\run_driver_birthdays_task.cmd"
if not defined TASK_CMD_SHORT set "TASK_CMD_SHORT=%TASK_CMD%"

if not exist "%TASK_CMD%" (
    echo FAILED: Task command not found: %TASK_CMD%
    exit /b 1
)

echo Creating driver birthday notification task: %TASK_NAME%
echo Schedule: daily at 08:15 local Windows time
echo Task command: %TASK_CMD_SHORT%

schtasks /Create /F /TN "%TASK_NAME%" /SC DAILY /ST 08:15 /RL HIGHEST /TR "cmd.exe /c \"\"%TASK_CMD_SHORT%\"\"" >nul 2>&1
if errorlevel 1 (
    schtasks /Create /F /TN "%TASK_NAME%" /SC DAILY /ST 08:15 /RL LIMITED /TR "cmd.exe /c \"\"%TASK_CMD_SHORT%\"\"" >nul 2>&1
)
if errorlevel 1 (
    echo FAILED: Could not create driver birthday notification task.
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set_etl_task_settings.ps1" -TaskName "%TASK_NAME%" >nul 2>&1
if errorlevel 1 (
    echo WARN: Could not apply resilient task settings. Run this script as administrator if needed.
)

schtasks /Query /TN "%TASK_NAME%" /FO LIST /V

echo Running birthday check once now...
cmd /c "%TASK_CMD%"
set "RC=%errorlevel%"
echo Birthday check one-shot exit code: %RC%

endlocal
exit /b %RC%
