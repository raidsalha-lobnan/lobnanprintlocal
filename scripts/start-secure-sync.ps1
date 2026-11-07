# Starts only the PRIVATE Node API. Never exposes PostgreSQL to the network.
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\start-secure-sync.ps1 -FrontendOrigin "https://YOUR-APP.vercel.app"
param([Parameter(Mandatory=$true)][string]$FrontendOrigin)
$ErrorActionPreference='Stop'
if($FrontendOrigin -notmatch '^https://[a-zA-Z0-9.-]+$') {
  throw 'FrontendOrigin must be the exact HTTPS origin of your verified frontend (no path or trailing slash).'
}
$root=Split-Path $PSScriptRoot -Parent
$pgRoot='D:\LobnanData'
$passwordFile=Join-Path $pgRoot 'private\postgres-password.dpapi'
$pgctl=Join-Path $pgRoot 'pgsql-17\pgsql\bin\pg_ctl.exe'
$cluster=Join-Path $pgRoot 'pgdata'
$server=Join-Path $root 'local-server\server.mjs'
$logdir=Join-Path $pgRoot 'logs'
if(!(Test-Path $passwordFile) -or !(Test-Path $pgctl) -or !(Test-Path $cluster)){
  throw 'PostgreSQL must be prepared on D: first, using scripts/prepare-postgres-windows.ps1'
}
if(!(Test-Path $server))throw 'Local API source file missing.'
if(!(Test-Path (Join-Path $root 'local-server\node_modules\pg'))){
  throw 'Install local-server dependencies first with npm.cmd install --prefix <project>\local-server'
}
New-Item -ItemType Directory -Path $logdir -Force|Out-Null
& $pgctl -D $cluster status | Out-Null
if($LASTEXITCODE -ne 0){
  & $pgctl -D $cluster -l (Join-Path $pgRoot 'postgres.log') -o '-h 127.0.0.1 -p 5432' -w start
  if($LASTEXITCODE -ne 0)throw 'Cannot start local PostgreSQL.'
}
$encryptedText=(Get-Content -LiteralPath $passwordFile -Raw).Trim()
$secure=ConvertTo-SecureString -String $encryptedText
$credential=New-Object System.Management.Automation.PSCredential('lobnan_pg_admin',$secure)
$pwd=$credential.GetNetworkCredential().Password
try{
  $env:DATABASE_URL='postgres://lobnan_pg_admin:'+([Uri]::EscapeDataString($pwd))+'@127.0.0.1:5432/lobnan_main'
  $env:SYNC_WORKSPACE='lobnan_main'
  $env:SYNC_AUTH_MODE='users'
  $env:SYNC_BIND_HOST='127.0.0.1'
  $env:SYNC_PORT='4577'
  $env:SYNC_ALLOWED_ORIGINS=$FrontendOrigin
  $env:CF_ACCESS_REQUIRED='0'
  if(Get-NetTCPConnection -State Listen -LocalPort 4577 -ErrorAction SilentlyContinue){
    throw 'Port 4577 already has a listener. Inspect the process instead of replacing it.'
  }
  $stdout=Join-Path $logdir 'sync-api.stdout.log'
  $stderr=Join-Path $logdir 'sync-api.stderr.log'
  $process=Start-Process -FilePath 'node.exe' -ArgumentList @('"' + $server + '"') -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  if(!$process)throw 'Unable to start Node server'
  Start-Sleep -Seconds 3
  try{
    $response=Invoke-RestMethod -Uri 'http://127.0.0.1:4577/api/v1/health' -TimeoutSec 5
    if($response.authMode -ne 'users')throw 'Refusing legacy shared-device token mode.'
    Write-Host 'SECURE_API_LOCAL_ONLY_READY: 127.0.0.1:4577' -ForegroundColor Green
  }catch{
    throw 'API health check failed. Inspect D:\LobnanData\logs\sync-api.stderr.log'
  }
}finally{
  $pwd=$null
  $env:DATABASE_URL=$null
}
Write-Host 'API is private and has not yet been published through zrok.'
Write-Host 'Do not point the public tunnel at API until role tests, snapshot import and browser CORS tests are complete.'
