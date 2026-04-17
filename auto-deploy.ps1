param(
  [int]$DebounceSeconds = 3
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:deployInProgress = $false
$script:lastDeployAt = [datetime]::MinValue

function Invoke-Deploy {
  $now = Get-Date
  if ($script:deployInProgress) { return }
  if (($now - $script:lastDeployAt).TotalSeconds -lt $DebounceSeconds) { return }

  $script:deployInProgress = $true
  try {
    $script:lastDeployAt = Get-Date
    Write-Host ""
    Write-Host "[$($script:lastDeployAt.ToString('HH:mm:ss'))] Change detected. Deploying to Netlify..."

    Push-Location $projectRoot
    npx netlify deploy --prod --dir "." --message "Auto deploy $(Get-Date -Format s)"
    Pop-Location

    Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] Deploy complete."
  }
  catch {
    Write-Host "Deploy failed: $($_.Exception.Message)"
  }
  finally {
    $script:deployInProgress = $false
  }
}

Write-Host "Watching project for changes: $projectRoot"
Write-Host "Press Ctrl + C to stop."
Write-Host "Tip: keep this terminal open while editing."

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $projectRoot
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, Size'

$ignoredDirs = @("\.git\", "\.netlify\", "\node_modules\", "\.cursor\")

function Should-Ignore([string]$fullPath) {
  foreach ($d in $ignoredDirs) {
    if ($fullPath -like "*$d*") { return $true }
  }
  return $false
}

$action = {
  $path = $Event.SourceEventArgs.FullPath
  if (Should-Ignore $path) { return }
  Start-Sleep -Milliseconds 500
  Invoke-Deploy
}

Register-ObjectEvent $watcher Changed -Action $action | Out-Null
Register-ObjectEvent $watcher Created -Action $action | Out-Null
Register-ObjectEvent $watcher Renamed -Action $action | Out-Null
Register-ObjectEvent $watcher Deleted -Action $action | Out-Null

while ($true) {
  Start-Sleep -Seconds 1
}
