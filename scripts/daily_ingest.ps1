# Pipeline J-1 RAN Intelligence — à planifier via Task Scheduler (ex. 06:00)
# Usage manuel :
#   .\scripts\daily_ingest.ps1
#   .\scripts\daily_ingest.ps1 -Date "2026.05.14"

param(
    [string]$Date = "",
    [string]$SourceRoot = "",
    [switch]$SkipTrust
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$Python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    $Python = "python"
}

$Args = @("$ProjectRoot\scripts\daily_ingest.py")
if ($Date) { $Args += @("--date", $Date) }
if ($SourceRoot) { $Args += @("--source-root", $SourceRoot) }
if ($SkipTrust) { $Args += "--skip-trust" }

$LogDir = Join-Path $ProjectRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("daily_ingest_{0}.log" -f (Get-Date -Format "yyyyMMdd_HHmmss"))

Write-Host "=== RAN Intelligence daily ingest ===" -ForegroundColor Cyan
Write-Host "Log : $LogFile"

& $Python @Args 2>&1 | Tee-Object -FilePath $LogFile
$ExitCode = $LASTEXITCODE

if ($ExitCode -ne 0) {
    Write-Host "INGESTION ECHEC (code $ExitCode)" -ForegroundColor Red
    exit $ExitCode
}

Write-Host "INGESTION OK" -ForegroundColor Green
exit 0
