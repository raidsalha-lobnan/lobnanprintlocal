# Test migration of an existing JSON snapshot in a disposable PostgreSQL database.
# NEVER overwrites, modifies, or drops lobnan_main. Real source file is read-only.
param([Parameter(Mandatory=$true)][string]$BackupFile)
$ErrorActionPreference='Stop'
if(!(Test-Path -LiteralPath $BackupFile)){throw 'BACKUP_NOT_FOUND'}
$root=Split-Path $PSScriptRoot -Parent
$bin='D:\LobnanData\pgsql-17\pgsql\bin'
$pwFile='D:\LobnanData\private\postgres-password.dpapi'
if(!(Test-Path -LiteralPath $pwFile)){throw 'POSTGRES_CREDENTIAL_MISSING'}
$encrypted=(Get-Content -LiteralPath $pwFile -Raw).Trim()
$credential=New-Object System.Management.Automation.PSCredential('lobnan_pg_admin',(ConvertTo-SecureString -String $encrypted))
$name='lobnan_migration_test_'+[guid]::NewGuid().ToString('N').Substring(0,16)
$created=$false
try {
  $password=$credential.GetNetworkCredential().Password
  $env:PGPASSWORD=$password
  & (Join-Path $bin 'createdb.exe') -h 127.0.0.1 -p 5432 -U lobnan_pg_admin $name
  if($LASTEXITCODE -ne 0){throw 'ISOLATED_DB_CREATION_FAILED'}
  $created=$true
  $env:DATABASE_URL='postgres://lobnan_pg_admin:'+([uri]::EscapeDataString($password))+'@127.0.0.1:5432/'+$name
  $env:SYNC_WORKSPACE='lobnan_main'
  Push-Location $root
  try{
    & node 'local-server/import-legacy-snapshot.mjs' $BackupFile --apply --confirm-empty-workspace
    if($LASTEXITCODE -ne 0){throw 'MIGRATION_REHEARSAL_FAILED'}
  }finally{Pop-Location}
  $query="SELECT (SELECT count(*) FROM sync_records WHERE entity='invoices'), (SELECT count(*) FROM sync_auth_users), (SELECT count(*) FROM sync_records WHERE entity='users' AND (value ? 'password'))"
  $rows=& (Join-Path $bin 'psql.exe') -X -w -h 127.0.0.1 -p 5432 -U lobnan_pg_admin -d $name -tAc $query
  if($LASTEXITCODE -ne 0){throw 'REHEARSAL_VERIFICATION_FAILED'}
  Write-Host ('REHEARSAL_COUNTS(invoices|auth_users|plaintext_password_profiles): '+($rows -join ''))
  $parts=(($rows -join '').Trim()).Split('|')
  if($parts.Length -ne 3 -or [int]$parts[1] -eq 0 -or [int]$parts[2] -ne 0){
    throw 'REHEARSAL_PASSWORD_OR_USERS_CHECK_FAILED'
  }
  Write-Host 'MIGRATION_REHEARSAL_VERIFIED; main database untouched'
}finally{
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  if($created){
    & (Join-Path $bin 'dropdb.exe') -h 127.0.0.1 -p 5432 -U lobnan_pg_admin --if-exists $name
    if($LASTEXITCODE -ne 0){Write-Warning 'Disposable database cleanup failed; review privately'}
  }
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $password=$null
  $credential=$null
}
