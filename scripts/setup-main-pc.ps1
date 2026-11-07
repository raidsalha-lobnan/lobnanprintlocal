# Run on the MAIN Windows PC in the cloned repository directory.
# Requires Docker Desktop. PostgreSQL runs in Docker, not on employee devices.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker Desktop is required on the main PC. Start Docker Desktop and retry.'
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker engine is not running.' }
$cfg = Join-Path (Get-Location) '.env.local-server'
if (-not (Test-Path $cfg)) {
  $a = New-Object byte[] 32
  $b = New-Object byte[] 48
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($a)
    $rng.GetBytes($b)
  } finally { $rng.Dispose() }
  $pw = -join ($a | ForEach-Object { $_.ToString('x2') })
  $token = -join ($b | ForEach-Object { $_.ToString('x2') })
  @"
POSTGRES_PASSWORD=$pw
SYNC_DEVICE_TOKEN=$token
SYNC_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,null
"@ | Set-Content -Path $cfg -Encoding UTF8
  Write-Host 'Created local-only .env.local-server with random secrets.' -ForegroundColor Green
}
docker compose --env-file .env.local-server -f docker-compose.local.yml up -d --build
if ($LASTEXITCODE -ne 0) {throw 'Docker startup failed'}
Write-Host 'Local API: http://localhost:4577' -ForegroundColor Green
Write-Host 'Do NOT forward PostgreSQL port 5432 on your router.' -ForegroundColor Yellow
Write-Host 'You can find the device pairing token in your private .env.local-server file.' -ForegroundColor Yellow
Write-Host 'Read PUBLIC_ACCESS_AR.md to configure Cloudflare after applying access controls.'
