$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force -Path 'private-backups' | Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$dest=Join-Path 'private-backups' "lobnan-$stamp.dump"
# PostgreSQL custom dump is streamed from the container; check output file size.
$cmd='docker compose --env-file .env.local-server -f docker-compose.local.yml exec -T db pg_dump -U lobnan -d lobnan_accounting -Fc'
cmd /c "$cmd > `"$dest`""
if ($LASTEXITCODE -ne 0) { Remove-Item $dest -ErrorAction SilentlyContinue; throw 'Backup failed' }
if ((Get-Item $dest).Length -lt 100) { throw 'Backup appears empty' }
Write-Host "Backup created: $dest"
Write-Host 'Copy encrypted backups outside the PC and test restoring to a separate database.'
