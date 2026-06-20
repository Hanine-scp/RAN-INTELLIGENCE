# Sauvegarde RAN Intelligence — lake Parquet, bronze, trust, PostgreSQL auth
# Usage :
#   .\scripts\backup.ps1
# Planifier via Task Scheduler (ex. tous les jours à 23:00)

param(
    [string]$BackupRoot = "",
    [string]$PgHost = "localhost",
    [int]$PgPort = 5433,
    [string]$PgUser = "ran_auth",
    [string]$PgDb = "ran_intelligence"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if (-not $BackupRoot) {
    $BackupRoot = Join-Path $ProjectRoot "backups"
}

$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$Target = Join-Path $BackupRoot $Stamp
New-Item -ItemType Directory -Force -Path $Target | Out-Null

Write-Host "=== RAN Intelligence backup ===" -ForegroundColor Cyan
Write-Host "Destination : $Target"

function Copy-IfExists {
    param([string]$Source, [string]$DestName)
    if (Test-Path $Source) {
        $Dest = Join-Path $Target $DestName
        if ((Get-Item $Source) -is [System.IO.DirectoryInfo]) {
            robocopy $Source $Dest /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
            if ($LASTEXITCODE -ge 8) { throw "robocopy failed for $Source" }
        } else {
            Copy-Item $Source $Dest -Force
        }
        Write-Host "  OK $DestName"
    } else {
        Write-Host "  SKIP $DestName (absent)"
    }
}

Copy-IfExists (Join-Path $ProjectRoot "data\lake") "data_lake"
Copy-IfExists (Join-Path $ProjectRoot "data\bronze") "data_bronze"
Copy-IfExists (Join-Path $ProjectRoot "data\trust") "data_trust"

$PgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if ($PgDump) {
    $SqlFile = Join-Path $Target "ran_intelligence_auth.sql"
    if (-not $env:PGPASSWORD) { $env:PGPASSWORD = "ran_auth_dev" }
    & pg_dump -h $PgHost -p $PgPort -U $PgUser -d $PgDb -f $SqlFile
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK PostgreSQL dump"
    } else {
        Write-Host "  WARN PostgreSQL dump failed (pg_dump exit $LASTEXITCODE)"
    }
} else {
    Write-Host "  SKIP PostgreSQL (pg_dump non installé)"
}

$Meta = @{
    created_at = (Get-Date).ToString("o")
    project_root = $ProjectRoot
    hostname = $env:COMPUTERNAME
} | ConvertTo-Json
$Meta | Set-Content (Join-Path $Target "backup_meta.json") -Encoding UTF8

Write-Host "BACKUP OK -> $Target" -ForegroundColor Green
