@echo off
setlocal
cd /d "%~dp0"

echo ==== %date% %time% START ====>> "%~dp0bot_console.log"
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

"%~dp0.venv\Scripts\python.exe" "%~dp0bot.py" >> "%~dp0bot_console.log" 2>&1

echo ==== %date% %time% END (exitcode=%errorlevel%) ====>> "%~dp0bot_console.log"
endlocal
