# Register zrok2 agent launcher to run at the user's Windows sign-in.
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$script=Join-Path $root 'scripts\start-zrok-agent-windows.ps1'
if(!(Test-Path $script)){throw 'ZROK_LAUNCHER_NOT_FOUND'}
if($script.Contains('"')){throw 'INVALID_PROJECT_DIRECTORY'}
$startup=[Environment]::GetFolderPath('Startup')
if(!(Test-Path $startup)){throw 'WINDOWS_STARTUP_NOT_FOUND'}
$target=Join-Path $startup 'Lobnan-Zrok-Agent.cmd'
$body='@echo off'+[Environment]::NewLine+
  'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$script+'"'+[Environment]::NewLine
[System.IO.File]::WriteAllText($target,$body,(New-Object System.Text.UTF8Encoding($false)))
Write-Host 'ZROK_AGENT_AUTOSTART_CONFIGURED_FOR_WINDOWS_LOGIN'
Write-Host 'Existing zrok share and configuration were not altered.'
