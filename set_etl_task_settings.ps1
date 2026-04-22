param(
    [Parameter(Mandatory=$true)]
    [string[]]$TaskName
)

$ErrorActionPreference = "Stop"

foreach ($name in $TaskName) {
    $task = Get-ScheduledTask -TaskName $name
    $task.Settings.DisallowStartIfOnBatteries = $false
    $task.Settings.StopIfGoingOnBatteries = $false
    $task.Settings.StartWhenAvailable = $true
    $task.Settings.WakeToRun = $true
    Set-ScheduledTask -InputObject $task | Out-Null
    Write-Host "OK: updated task settings for $name"
}
