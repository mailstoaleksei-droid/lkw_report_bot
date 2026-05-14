param(
    [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$TaskName = "LKW Planning PostgreSQL Backup",
    [string]$At = "02:30"
)

$ErrorActionPreference = "Stop"

$ProjectDir = (Resolve-Path $ProjectDir).Path
$backupScript = Join-Path $ProjectDir "scripts\backup_postgres.ps1"

if (-not (Test-Path $backupScript)) {
    throw "Backup script not found: $backupScript"
}

$shell = "powershell.exe"
$pwsh = Get-Command pwsh.exe -ErrorAction SilentlyContinue
if ($pwsh) {
    $shell = $pwsh.Source
}

$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`" -ProjectDir `"$ProjectDir`""
$action = New-ScheduledTaskAction -Execute $shell -Argument $argument
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Creates a daily PostgreSQL backup for the isolated LKW Planning database." `
    -Force | Out-Null

Write-Output "Scheduled task installed: $TaskName at $At"
