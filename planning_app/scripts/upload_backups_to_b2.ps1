param(
    [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$EnvFile = "",
    [string]$BackupDir = "",
    [string]$FilePath = ""
)

$ErrorActionPreference = "Stop"

function Import-DotEnv {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        throw "Env file not found: $Path"
    }

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#") -or $line -notmatch "=") { return }
        $parts = $line.Split("=", 2)
        $name = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"').Trim("'")
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

$ProjectDir = (Resolve-Path $ProjectDir).Path
if ($EnvFile -eq "") {
    $EnvFile = Join-Path $ProjectDir ".env"
}
if ($BackupDir -eq "") {
    $BackupDir = Join-Path $ProjectDir "storage\backups"
}

Import-DotEnv -Path $EnvFile

if ($env:OFFSITE_BACKUP_ENABLED -ne "true") {
    Write-Output "Offsite backup is disabled."
    return
}

foreach ($name in @("B2_BUCKET", "B2_KEY_ID", "B2_APPLICATION_KEY")) {
    if (-not (Get-Item -Path "Env:$name" -ErrorAction SilentlyContinue).Value) {
        throw "$name must be configured in .env when offsite backup is enabled"
    }
}

$rclone = Get-Command rclone.exe -ErrorAction SilentlyContinue
if (-not $rclone) {
    $rclone = Get-Command rclone -ErrorAction SilentlyContinue
}
if (-not $rclone) {
    throw "rclone is required for Backblaze B2 upload. Install rclone before enabling offsite backup."
}

$remoteName = if ($env:B2_REMOTE_NAME) { $env:B2_REMOTE_NAME } else { "backblaze_b2" }
$prefix = if ($env:B2_PREFIX) { $env:B2_PREFIX.Trim("/") } else { "daily" }
$destination = if ($prefix) { "$remoteName`:$($env:B2_BUCKET)/$prefix" } else { "$remoteName`:$($env:B2_BUCKET)" }

[Environment]::SetEnvironmentVariable("RCLONE_CONFIG_$($remoteName.ToUpper())_TYPE", "b2", "Process")
[Environment]::SetEnvironmentVariable("RCLONE_CONFIG_$($remoteName.ToUpper())_ACCOUNT", $env:B2_KEY_ID, "Process")
[Environment]::SetEnvironmentVariable("RCLONE_CONFIG_$($remoteName.ToUpper())_KEY", $env:B2_APPLICATION_KEY, "Process")

if ($FilePath) {
    if (-not (Test-Path $FilePath)) {
        throw "Backup file not found: $FilePath"
    }
    & $rclone.Source copyto $FilePath "$destination/$([IO.Path]::GetFileName($FilePath))" --immutable --checksum --transfers 2 --checkers 4
    Write-Output "Offsite backup uploaded: $FilePath -> $destination"
    return
}

if (-not (Test-Path $BackupDir)) {
    throw "Backup directory not found: $BackupDir"
}

& $rclone.Source copy $BackupDir $destination --include "lkw_planning_*.dump" --immutable --checksum --transfers 2 --checkers 4
Write-Output "Offsite backup sync completed: $BackupDir -> $destination"
