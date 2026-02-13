@echo off
setlocal
cd /d "%~dp0"

set "STOP_FLAG=%~dp0stop_bot.flag"
echo stop > "%STOP_FLAG%"

echo Stopping LKW report bot...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*lkw_report_bot*bot.py*' }; foreach($p in $procs){ try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {} }"

echo Stopping supervisor processes...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$cmds = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*lkw_report_bot*run_bot.cmd*' }; foreach($c in $cmds){ try { Stop-Process -Id $c.ProcessId -Force -ErrorAction Stop } catch {} }"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$vbs = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'wscript.exe' -and $_.CommandLine -like '*lkw_report_bot*run_silent.vbs*' }; foreach($v in $vbs){ try { Stop-Process -Id $v.ProcessId -Force -ErrorAction Stop } catch {} }"

echo Stop signal created: %STOP_FLAG%
endlocal
