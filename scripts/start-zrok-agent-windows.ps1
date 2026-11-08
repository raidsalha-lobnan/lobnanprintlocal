# Start the existing zrok agent on Windows user login, without recreating a name or share.
# Requires an initialized zrok2 environment under the current Windows user.
$ErrorActionPreference='Stop'
$exe=Join-Path $env:USERPROFILE 'bin\zrok2.exe'
if(!(Test-Path -LiteralPath $exe)){throw 'ZROK_BINARY_MISSING'}
$agents=@(Get-CimInstance Win32_Process -Filter "Name='zrok2.exe'" |
  Where-Object {$_.CommandLine -match '(?i)\bagent\s+start\b'})
if($agents.Count -gt 0){
  Write-Output 'ZROK_AGENT_ALREADY_RUNNING'
  exit 0
}
$logDir='D:\LobnanData\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$out=Join-Path $logDir 'zrok-agent-out.log'
$err=Join-Path $logDir 'zrok-agent-error.log'
$started=Start-Process -FilePath $exe -ArgumentList @('agent','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
Start-Sleep -Seconds 4
$process=Get-Process -Id $started.Id -ErrorAction SilentlyContinue
if(!$process){throw 'ZROK_AGENT_START_FAILED'}
Write-Output 'ZROK_AGENT_STARTED_FOR_CURRENT_WINDOWS_USER'
Write-Output 'Verify the named share by running: zrok2 agent status'
