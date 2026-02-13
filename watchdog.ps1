param(
    [int]$MaxHeartbeatAgeSec = 180,
    [int]$WebAppPort = 0
)

$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile = Join-Path $baseDir "watchdog.log"
$heartbeatFile = Join-Path $env:TEMP "lkw_report_bot_heartbeat.txt"
$runSilent = Join-Path $baseDir "run_silent.vbs"
$runBot = Join-Path $baseDir "run_bot.cmd"
$envFile = Join-Path $baseDir ".env"

# HTTP health check failure counter (persisted via file to survive script re-invocations)
$httpFailFile = Join-Path $env:TEMP "lkw_report_bot_http_fails.txt"

function Log([string]$msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $logFile -Value "[$ts] $msg"
}

function GetWebAppPort {
    # Use parameter if provided, otherwise read from .env
    if ($WebAppPort -gt 0) { return $WebAppPort }
    if (Test-Path $envFile) {
        $lines = Get-Content $envFile -ErrorAction SilentlyContinue
        foreach ($line in $lines) {
            if ($line -match "^WEBAPP_PORT=(\d+)") {
                return [int]$Matches[1]
            }
        }
    }
    return 8443  # default
}

function IsBotRunning {
    $procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*lkw_report_bot*bot.py*" }
    return @($procs).Count -gt 0
}

function IsSupervisorRunning {
    $cmds = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "cmd.exe" -and $_.CommandLine -like "*lkw_report_bot*run_bot.cmd*" }
    return @($cmds).Count -gt 0
}

function IsHeartbeatFresh {
    if (-not (Test-Path $heartbeatFile)) { return $false }
    $age = (New-TimeSpan -Start (Get-Item $heartbeatFile).LastWriteTime -End (Get-Date)).TotalSeconds
    return $age -le $MaxHeartbeatAgeSec
}

function IsHttpHealthy {
    $port = GetWebAppPort
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$port/healthz" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            $body = $resp.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($body.ok -eq $true) { return $true }
        }
        return $false
    } catch {
        return $false
    }
}

function GetHttpFailCount {
    if (Test-Path $httpFailFile) {
        $val = Get-Content $httpFailFile -ErrorAction SilentlyContinue
        if ($val -match "^\d+$") { return [int]$val }
    }
    return 0
}

function SetHttpFailCount([int]$count) {
    Set-Content -Path $httpFailFile -Value $count -ErrorAction SilentlyContinue
}

function StopBotProcesses {
    $procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*lkw_report_bot*bot.py*" }
    foreach ($p in $procs) {
        try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {}
    }
}

function StartBotSupervisor {
    if (Test-Path $runSilent) {
        Start-Process -FilePath "wscript.exe" -ArgumentList "`"$runSilent`"" -WindowStyle Hidden
        Log "Bot restart triggered via run_silent.vbs"
    } elseif (Test-Path $runBot) {
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$runBot`"" -WindowStyle Minimized
        Log "Bot restart triggered via run_bot.cmd"
    } else {
        Log "ERROR: no start script found"
    }
}

try {
    Log "Watchdog check started"
    $running = IsBotRunning
    $fresh = IsHeartbeatFresh
    $supervisor = IsSupervisorRunning

    # HTTP health check (only if bot process is running)
    $httpOk = $true
    if ($running) {
        $httpOk = IsHttpHealthy
        if ($httpOk) {
            SetHttpFailCount 0
            Log "HTTP /healthz OK"
        } else {
            $fails = (GetHttpFailCount) + 1
            SetHttpFailCount $fails
            Log "HTTP /healthz FAIL (consecutive: $fails)"
        }
    }

    $httpFails = GetHttpFailCount
    $httpUnhealthy = $httpFails -ge 3  # 3 consecutive failures = unhealthy

    if ($running -and $fresh -and (-not $httpUnhealthy)) {
        Log "Bot healthy (running + heartbeat fresh + HTTP OK)"
    } elseif ($supervisor -and (-not $httpUnhealthy)) {
        Log "Supervisor is active, waiting for bot recovery (running=$running, heartbeat=$fresh)"
    } else {
        $reason = @()
        if (-not $running) { $reason += "not running" }
        if (-not $fresh) { $reason += "heartbeat stale" }
        if ($httpUnhealthy) { $reason += "HTTP /healthz failed ${httpFails}x" }
        Log "Bot unhealthy ($($reason -join ', ')), restarting..."
        SetHttpFailCount 0
        StopBotProcesses
        Start-Sleep -Seconds 2
        StartBotSupervisor
    }

    # Rotate log if > 100KB
    if (Test-Path $logFile) {
        $size = (Get-Item $logFile).Length
        if ($size -gt 102400) {
            Get-Content $logFile -Tail 500 | Set-Content "$logFile.new"
            Move-Item -Force "$logFile.new" $logFile
        }
    }
} catch {
    try { Log "Watchdog error: $($_.Exception.Message)" } catch {}
    exit 1
}

exit 0
