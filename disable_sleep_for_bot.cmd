@echo off
setlocal

echo Configuring power settings for bot uptime...

powercfg /change monitor-timeout-ac 0 >nul 2>&1
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change hibernate-timeout-ac 0 >nul 2>&1

REM Optional for battery-powered devices
powercfg /change standby-timeout-dc 0 >nul 2>&1
powercfg /change hibernate-timeout-dc 0 >nul 2>&1
powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 >nul 2>&1
powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 >nul 2>&1
powercfg /h off >nul 2>&1
powercfg /SETACTIVE SCHEME_CURRENT >nul 2>&1

echo Done. Sleep/hibernate timeouts set to NEVER.
echo Lid close action set to "Do nothing" (AC/DC), hibernate disabled.
echo Note: if Windows still enters Sleep, bot and scheduler cannot run.

endlocal
