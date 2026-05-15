param(
    [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$EnvFile = "",
    [string]$BackupDir = "",
    [int]$RetentionDays = 0
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

if (-not $env:POSTGRES_DB -or -not $env:POSTGRES_USER) {
    throw "POSTGRES_DB and POSTGRES_USER must be configured in .env"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$fileName = "lkw_planning_$stamp.dump"
$target = Join-Path $BackupDir $fileName

Push-Location $ProjectDir
try {
    $dumpCommand = "pg_dump --format=custom --file=/backups/$fileName --username=`"`$POSTGRES_USER`" --dbname=`"`$POSTGRES_DB`""
    docker compose exec -T postgres sh -lc $dumpCommand
}
finally {
    Pop-Location
}

if (-not (Test-Path $target)) {
    throw "Backup was not created: $target"
}

if ($RetentionDays -le 0) {
    $RetentionDays = 30
    if ($env:BACKUP_RETENTION_DAYS -match "^\d+$") {
        $RetentionDays = [int]$env:BACKUP_RETENTION_DAYS
    }
}

Get-ChildItem $BackupDir -Filter "lkw_planning_*.dump" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
    Remove-Item -Force

Write-Output "Backup created: $target"
Write-Output "Retention days: $RetentionDays"

if ($env:OFFSITE_BACKUP_ENABLED -eq "true") {
    $offsiteScript = Join-Path $ProjectDir "scripts\upload_backups_to_b2.ps1"
    if (-not (Test-Path $offsiteScript)) {
        throw "Offsite backup is enabled but upload script is missing: $offsiteScript"
    }

    & $offsiteScript -ProjectDir $ProjectDir -EnvFile $EnvFile -BackupDir $BackupDir -FilePath $target
}
