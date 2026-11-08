# Verify native PostgreSQL backup by restoring it into an isolated temporary database.
# Never touches lobnan_main or drops any non-test database.
param([Parameter(Mandatory=$true)][string]$BackupFile)
$ErrorActionPreference='Stop'
if(!(Test-Path $BackupFile)){throw 'BACKUP_NOT_FOUND'}
$bin='D:\LobnanData\pgsql-17\pgsql\bin'
$secret='D:\LobnanData\private\postgres-password.dpapi'
if(!(Test-Path $secret)){throw 'PRIVATE_CREDENTIAL_MISSING'}
$credential=New-Object System.Management.Automation.PSCredential('lobnan_pg_admin',(ConvertTo-SecureString -String ((Get-Content $secret -Raw).Trim())))
$db='lobnan_restore_test_'+[guid]::NewGuid().ToString('N').Substring(0,16)
$created=$false
try {
  $env:PGPASSWORD=$credential.GetNetworkCredential().Password
  & (Join-Path $bin 'createdb.exe') -h 127.0.0.1 -p 5432 -U lobnan_pg_admin $db
  if($LASTEXITCODE -ne 0){throw 'RESTORE_TEST_DB_CREATE_FAILED'}
  $created=$true
  & (Join-Path $bin 'pg_restore.exe') -w -h 127.0.0.1 -p 5432 -U lobnan_pg_admin -d $db --no-owner --no-acl --exit-on-error $BackupFile
  if($LASTEXITCODE -ne 0){throw 'RESTORE_FAILED'}
  $sql="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"
  $number=& (Join-Path $bin 'psql.exe') -X -w -h 127.0.0.1 -U lobnan_pg_admin -d $db -tAc $sql
  if($LASTEXITCODE -ne 0 -or [int](($number -join '').Trim()) -lt 4){throw 'RESTORE_SCHEMA_INCOMPLETE'}
  Write-Host 'BACKUP_RESTORE_VERIFIED_ON_ISOLATED_DATABASE'
}finally{
  if($created){
    & (Join-Path $bin 'dropdb.exe') -h 127.0.0.1 -p 5432 -U lobnan_pg_admin --if-exists $db
    if($LASTEXITCODE -ne 0){Write-Warning 'Isolated restore test database cleanup failed'}
  }
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $credential=$null
}
