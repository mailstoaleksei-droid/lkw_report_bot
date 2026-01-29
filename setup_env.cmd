@echo off
setlocal
cd /d "%~dp0"

echo === Creating/activating venv ===
if not exist ".venv" (
    python -m venv .venv
)
call .venv\Scripts\activate.bat

echo === Upgrade pip ===
python -m pip install --upgrade pip

echo === Install requirements ===
python -m pip install -r requirements.txt

echo DONE
endlocal
