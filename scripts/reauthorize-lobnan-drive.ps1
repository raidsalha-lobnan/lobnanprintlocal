param(
  [switch]$VerifyOnly,
  [switch]$RunBackupOnce
)
$ErrorActionPreference='Stop'
$rclone='D:\LobnanData\tools\rclone\rclone.exe'
$required=@('lobnan-gdrive:','lobnan-encrypted:')
if(!(Test-Path -LiteralPath $rclone)){throw 'RCLONE_EXECUTABLE_MISSING'}
$remotes=@(& $rclone listremotes)
if($LASTEXITCODE -ne 0){throw 'RCLONE_CONFIG_UNREADABLE'}
foreach($remote in $required){
  if($remotes -notcontains $remote){throw ('RCLONE_REMOTE_MISSING: '+$remote)}
}
if(-not $VerifyOnly){
  Write-Host 'One-time owner authorization required for Google Drive.' -ForegroundColor Yellow
  Write-Host 'Sign in only with the approved main Google Drive account.'
  Write-Host 'Do not share the authorization tokens or rclone.conf.'
  & $rclone config reconnect 'lobnan-gdrive:'
  if($LASTEXITCODE -ne 0){throw 'GOOGLE_DRIVE_RECONNECT_ABORTED_OR_FAILED'}
}
& $rclone lsf 'lobnan-gdrive:' --max-depth 1 --log-level ERROR | Out-Null
if($LASTEXITCODE -ne 0){throw 'GOOGLE_DRIVE_ACCOUNT_NOT_AUTHORIZED'}
& $rclone lsf 'lobnan-encrypted:' --max-depth 1 --log-level ERROR | Out-Null
if($LASTEXITCODE -ne 0){throw 'GOOGLE_DRIVE_ENCRYPTED_REMOTE_NOT_AVAILABLE'}
Write-Host 'Google Drive and encrypted backup remote verified.' -ForegroundColor Green
if($RunBackupOnce){
  Start-ScheduledTask -TaskName 'Lobnan Hourly PostgreSQL Backup'
  Write-Host 'Backup task triggered. Verify its log and remote upload result before assuming success.'
}
