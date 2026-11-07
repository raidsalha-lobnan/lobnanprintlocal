$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Install Docker Desktop and start it before continuing." }
$cfg = '.env.local-server'
if (-not (Test-Path $cfg)) {
  $pwdBytes = New-Object byte[] 30
  $tokenBytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($pwdBytes)
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($tokenBytes)
  $password = [Convert]::ToHexString($pwdBytes)
  $token = [Convert]::ToHexString($tokenBytes)
  @"
POSTGRES_PASSWORD=$password
SYNC_DEVICE_TOKEN=$token
SYNC_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,null
"@ | Set-Content -Path $cfg -Encoding UTF8
  Write-Host "Created private .env.local-server with random secrets"
}
docker compose --env-file $cfg -f docker-compose.local.yml up -d --build
if ($LASTEXITCODE -ne 0) {throw "Docker launch failed"}
$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -ne 'WellKnown' -and $_.IPAddress -notmatch '^(127|169\.254)\.' } | Select-Object -ExpandProperty IPAddress
$token = ((Get-Content $cfg | Where-Object {$_ -match '^SYNC_DEVICE_TOKEN='}) -replace '^SYNC_DEVICE_TOKEN=','')
Write-Host "LOCAL SERVER: http://localhost:4577"
Write-Host "OTHER DEVICES: http://<MAIN_PC_LAN_IP>:4577"
Write-Host "Detected LAN addresses: $($ips -join ', ')"
Write-Host "PAIRING TOKEN (keep private): $token"
Write-Host "Run the frontend: npm install; npm run dev"
