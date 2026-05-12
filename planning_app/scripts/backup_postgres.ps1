param(
    [string]$EnvFile = ".env",
    [string]$BackupDir = "./storage/backups"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $EnvFile)) {
    throw "Env file not found: $EnvFile"
}

$envLines = Get-Content $EnvFile
foreach ($line in $envLines) {
    if ($line -match "^\s*#" -or $line -notmatch "=") { continue }
    $parts = $line.Split("=", 2)
    [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
}

if (-not $env:DATABASE_URL) {
    throw "DATABASE_URL is missing"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$target = Join-Path $BackupDir "lkw_planning_$stamp.dump"

pg_dump --format=custom --file="$target" "$env:DATABASE_URL"

$retentionDays = 30
if ($env:BACKUP_RETENTION_DAYS -match "^\d+$") {
    $retentionDays = [int]$env:BACKUP_RETENTION_DAYS
}

Get-ChildItem $BackupDir -Filter "lkw_planning_*.dump" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$retentionDays) } |
    Remove-Item -Force

Write-Output "Backup created: $target"

