# Backup only: do not manually copy the live PostgreSQL volume!
# Backups are not encrypted by this script. Store on an encrypted external drive and test restore separately.
param([string]$DestinationDir = (Join-Path $env:USERPROFILE 'Documents\LobnanPrintBackups'))
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path '.env.local-server')) { throw 'Missing private .env.local-server configuration' }
New-Item -ItemType Directory -Force -Path $DestinationDir | Out-Null
$cid = (docker compose --env-file .env.local-server -f docker-compose.local.yml ps -q db | Select-Object -First 1)
if (-not $cid) { throw 'PostgreSQL container is not running' }
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$name = "lobnan_$stamp.dump"
$remote = "/tmp/$name"
$local = Join-Path $DestinationDir $name
try {
  docker exec $cid pg_dump -U lobnan -d lobnan_accounting -Fc -f $remote
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
  docker cp "${cid}:$remote" $local
  if ($LASTEXITCODE -ne 0) { throw 'docker cp failed' }
  if (-not (Test-Path $local) -or (Get-Item $local).Length -lt 100) { throw 'Backup file was not created correctly' }
  Write-Host "Backup created: $local" -ForegroundColor Green
  Write-Warning 'Move to an encrypted external backup target. Run a restore drill before production.'
} finally {
  docker exec $cid rm -f $remote *> $null
}
