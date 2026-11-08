# Installs a per-user Windows Startup entry for the PRIVATE PostgreSQL API.
# It starts only AFTER sign-in as the same Windows user whose DPAPI credential is stored.
# No public tunnel is launched; no secrets are embedded in Startup.
param([string]$FrontendOrigin='https://lobnanprintlocal.vercel.app')
$ErrorActionPreference='Stop'
$allowedOrigins=@($FrontendOrigin -split ',' | ForEach-Object {$_.Trim()})
if(!$allowedOrigins.Count -or @($allowedOrigins | Where-Object {$_ -notmatch '^https://[a-zA-Z0-9.-]+
$root=Split-Path $PSScriptRoot -Parent
$script=Join-Path $root 'scripts\start-secure-sync.ps1'
if(!(Test-Path $script)){ throw 'Missing secure sync launcher' }
$startup=[Environment]::GetFolderPath('Startup')
if(!(Test-Path $startup)){ throw 'Windows Startup folder unavailable' }
$target=Join-Path $startup 'Lobnan-Private-Postgres-API.cmd'
# The project directory is fixed to this local clone; use cmd-safe quoting.
if($script.Contains('"') -or $FrontendOrigin.Contains('"')){throw 'Unsafe command path or origin'}
$line='@echo off'+[Environment]::NewLine+
  'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$script+'" -FrontendOrigin "'+$FrontendOrigin+'"'+[Environment]::NewLine
[System.IO.File]::WriteAllText($target,$line,(New-Object System.Text.UTF8Encoding($false)))
Write-Host 'PRIVATE_API_STARTUP_INSTALLED: at Windows user logon'
Write-Host 'No zrok public share was created or modified.'
Write-Host 'PostgreSQL and the API need Windows sign-in and the host computer to be on.'
}).Count){throw 'Invalid frontend HTTPS origins'}
$root=Split-Path $PSScriptRoot -Parent
$script=Join-Path $root 'scripts\start-secure-sync.ps1'
if(!(Test-Path $script)){ throw 'Missing secure sync launcher' }
$startup=[Environment]::GetFolderPath('Startup')
if(!(Test-Path $startup)){ throw 'Windows Startup folder unavailable' }
$target=Join-Path $startup 'Lobnan-Private-Postgres-API.cmd'
# The project directory is fixed to this local clone; use cmd-safe quoting.
if($script.Contains('"') -or $FrontendOrigin.Contains('"')){throw 'Unsafe command path or origin'}
$line='@echo off'+[Environment]::NewLine+
  'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$script+'" -FrontendOrigin "'+$FrontendOrigin+'"'+[Environment]::NewLine
[System.IO.File]::WriteAllText($target,$line,(New-Object System.Text.UTF8Encoding($false)))
Write-Host 'PRIVATE_API_STARTUP_INSTALLED: at Windows user logon'
Write-Host 'No zrok public share was created or modified.'
Write-Host 'PostgreSQL and the API need Windows sign-in and the host computer to be on.'
