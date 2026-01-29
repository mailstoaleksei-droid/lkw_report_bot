@echo off
REM =====================================================
REM LKW Report Bot Watchdog
REM Проверяет запущен ли бот и перезапускает при падении
REM Запускать через Task Scheduler каждые 5 минут
REM =====================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

set "LOG_FILE=%~dp0watchdog.log"
set "BOT_SCRIPT=%~dp0run_bot.cmd"
set "LOCK_FILE=%TEMP%\lkw_report_bot_single_instance.lock"
set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"

REM Добавляем timestamp в лог
echo [%date% %time%] Watchdog check started >> "%LOG_FILE%"

REM Проверяем существует ли lock файл и заблокирован ли он
REM Если lock файл существует и заблокирован - бот работает
2>nul (
    >>"%LOCK_FILE%" (call )
) && (
    REM Файл не заблокирован - бот НЕ работает
    echo [%date% %time%] Bot is NOT running - restarting... >> "%LOG_FILE%"

    REM Убиваем зависшие процессы python если есть
    taskkill /F /IM python.exe /FI "WINDOWTITLE eq LKW*" >nul 2>&1

    REM Небольшая пауза перед перезапуском
    timeout /t 3 /nobreak >nul

    REM Запускаем бота через VBS (скрытый режим)
    if exist "%~dp0run_silent.vbs" (
        start "" wscript.exe "%~dp0run_silent.vbs"
        echo [%date% %time%] Bot restarted via run_silent.vbs >> "%LOG_FILE%"
    ) else (
        start "" /min cmd /c "%BOT_SCRIPT%"
        echo [%date% %time%] Bot restarted via run_bot.cmd >> "%LOG_FILE%"
    )
) || (
    REM Файл заблокирован - бот работает
    echo [%date% %time%] Bot is running OK >> "%LOG_FILE%"
)

REM Очистка старых логов (оставляем последние 1000 строк)
if exist "%LOG_FILE%" (
    for %%A in ("%LOG_FILE%") do if %%~zA gtr 102400 (
        echo [%date% %time%] Rotating log file... >> "%LOG_FILE%"
        powershell -Command "Get-Content '%LOG_FILE%' -Tail 500 | Set-Content '%LOG_FILE%.new'" 2>nul
        if exist "%LOG_FILE%.new" (
            move /y "%LOG_FILE%.new" "%LOG_FILE%" >nul 2>&1
        )
    )
)

endlocal
