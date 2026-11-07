# Run from an administrator-controlled Windows PC with Docker Desktop.
# Does not create Cloudflare credentials or publish real data.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$cfg = Join-Path $root '.env.cloud-preview'
$compose = Join-Path $root 'docker-compose.cloud-preview.yml'

function New-SecretHex([int]$bytesCount) {
  $bytes = New-Object byte[] $bytesCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker Desktop is required on the main PC. Cloudflare Tunnel cannot run on an inaccessible or powered-off PC.'
}

if (-not (Test-Path $cfg)) {
  $password = New-SecretHex 32
  $sharedToken = New-SecretHex 48
  $data = @"
POSTGRES_PASSWORD=$password
SYNC_DEVICE_TOKEN=$sharedToken
CLOUDFLARE_TUNNEL_TOKEN=REPLACE_WITH_YOUR_PRIVATE_CLOUDFLARE_TUNNEL_TOKEN
CF_ACCESS_TEAM_DOMAIN=REPLACE_WITH_HTTPS_TEAM_DOMAIN
CF_ACCESS_AUD=REPLACE_WITH_ACCESS_APP_AUD_TAG
"@
  [System.IO.File]::WriteAllText($cfg, $data + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding $false))
  Write-Host 'Created local secret file .env.cloud-preview; it is ignored by Git.'
  Write-Host 'Open the file locally and fill CLOUDFLARE_TUNNEL_TOKEN from the Cloudflare dashboard; never share it in chat or GitHub.'
  exit 2
}
$envText = [System.IO.File]::ReadAllText($cfg)
if ($envText -match 'REPLACE_WITH_|YOUR_PRIVATE|CLOUDFLARE_TUNNEL_TOKEN=\s*(\r?\n|$)' -or
    $envText -notmatch 'CF_ACCESS_TEAM_DOMAIN=https://[a-z0-9-]+\.cloudflareaccess\.com' -or
    $envText -notmatch 'CF_ACCESS_AUD=[a-zA-Z0-9_-]{12,180}') {
  throw 'Cloudflare Tunnel token, Access team domain or application AUD missing. Fill the private .env.cloud-preview and rerun.'
}
Write-Host 'Starting isolated demo database, API, UI and Cloudflare connector...'
& docker compose --env-file $cfg -f $compose up -d --build
if ($LASTEXITCODE -ne 0) { throw 'Docker compose startup failed. Check Docker Desktop and docker compose logs.' }
Write-Host 'Stack started. Cloudflare hostname must be configured in Cloudflare dashboard and protected with Access BEFORE opening it.'
Write-Host 'Cloudflare Tunnel route: service http://web:8080 (same Docker network).'
Write-Host 'This is a staging/demo stack: do not import or enter real accounting records.'
