# Native Windows PostgreSQL 17 backup, not Docker.
# Creates a custom-format backup from D:\LobnanData\pgdata to a PRIVATE local directory.
# The file contains sensitive financial data. Copy to an encrypted off-site backup.
param([string]$BackupDirectory='D:\LobnanData\backups')
$ErrorActionPreference='Stop'
$bin='D:\LobnanData\pgsql-17\pgsql\bin'
$encrypted='D:\LobnanData\private\postgres-password.dpapi'
$cluster='D:\LobnanData\pgdata\PG_VERSION'
if(!(Test-Path $cluster)){throw 'POSTGRES_CLUSTER_MISSING'}
if(!(Test-Path $encrypted)){throw 'PRIVATE_CREDENTIAL_MISSING'}
$pgdump=Join-Path $bin 'pg_dump.exe'
$restore=Join-Path $bin 'pg_restore.exe'
if(!(Test-Path $pgdump) -or !(Test-Path $restore)){throw 'POSTGRES_BINARY_MISSING'}
New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$backup=Join-Path $BackupDirectory ('lobnan-main-'+$stamp+'.dump')
$secure=ConvertTo-SecureString -String ((Get-Content $encrypted -Raw).Trim())
$credential=New-Object System.Management.Automation.PSCredential('lobnan_pg_admin',$secure)
try{
  $env:PGPASSWORD=$credential.GetNetworkCredential().Password
  & $pgdump -w -h 127.0.0.1 -p 5432 -U lobnan_pg_admin -d lobnan_main -Fc --no-owner --no-acl -f $backup
  if($LASTEXITCODE -ne 0){throw 'PG_DUMP_FAILED'}
  if(!(Test-Path $backup) -or (Get-Item $backup).Length -lt 100){throw 'BACKUP_MISSING_OR_TOO_SMALL'}
  & $restore -l $backup | Out-Null
  if($LASTEXITCODE -ne 0){throw 'BACKUP_FORMAT_VALIDATION_FAILED'}
  Write-Host ('BACKUP_VERIFIED: '+$backup)
  Write-Host ('BACKUP_BYTES: '+(Get-Item $backup).Length)
  Write-Host 'IMPORTANT: This local backup is not encrypted. Keep it restricted and copy an encrypted copy off-device.'
}catch{
  if(Test-Path $backup){Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue}
  throw
}finally{
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $credential=$null
  $secure=$null
}
