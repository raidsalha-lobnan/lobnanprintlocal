# Restart only the verified private Lobnan API listener after a tested update.
# PostgreSQL, zrok names, and financial database remain untouched.
param([string]$FrontendOrigin='https://lobnanprintlocal.vercel.app')
$ErrorActionPreference='Stop'
$listener=Get-NetTCPConnection -State Listen -LocalPort 4577 -ErrorAction SilentlyContinue |
 Where-Object {$_.LocalAddress -eq '127.0.0.1'} | Select-Object -First 1
if($listener){
  $pidOfListener=[int]$listener.OwningProcess
  $process=Get-CimInstance Win32_Process -Filter "ProcessId=$pidOfListener"
  if(!$process -or $process.Name -ne 'node.exe' -or
     $process.CommandLine -notmatch 'local-server[\\/]server\.mjs'){
     throw 'PORT_OCCUPIED_BY_UNRECOGNIZED_PROCESS'
  }
  $check=Invoke-RestMethod -Uri 'http://127.0.0.1:4577/api/v1/health' -TimeoutSec 4
  if($check.authMode -ne 'users' -or $check.workspace -ne 'lobnan_main'){
    throw 'REFUSING_TO_REPLACE_UNKNOWN_API'
  }
  Stop-Process -Id $pidOfListener -Force -ErrorAction Stop
  Start-Sleep -Seconds 2
}
& (Join-Path $PSScriptRoot 'start-secure-sync.ps1') -FrontendOrigin $FrontendOrigin
if($LASTEXITCODE -ne 0){throw 'PRIVATE_API_RESTART_FAILED'}
$health=Invoke-RestMethod -Uri 'http://127.0.0.1:4577/api/v1/health' -TimeoutSec 5
if($health.authMode -ne 'users' -or $health.workspace -ne 'lobnan_main'){
  throw 'RESTARTED_API_UNHEALTHY'
}
Write-Host 'PRIVATE_API_RESTART_VERIFIED'
