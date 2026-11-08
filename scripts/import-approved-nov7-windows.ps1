# One-time, fail-closed migration of the explicitly approved 2026-11-07 accounting snapshot.
# Requires an empty lobnan_main workspace. Preserves source and all historical archives.
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$root='D:\LobnanData'
$bin=Join-Path $root 'pgsql-17\pgsql\bin'
$private=Join-Path $root 'private'
$pwFile=Join-Path $private 'postgres-password.dpapi'
$download='C:\Users\RaidSalha\Downloads'
$matches=@(Get-ChildItem -LiteralPath $download -File | Where-Object {$_.Name.EndsWith('2026-11-07_13-10-57.json')})
if($matches.Count -ne 1){throw 'APPROVED_SNAPSHOT_MUST_BE_UNIQUE'}
$source=$matches[0].FullName
$expectedHash='15af3839ac12405a7059b288e7c0c357b693617e04108554dc772e934436f77b'
if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash){
 throw 'APPROVED_SNAPSHOT_CHECKSUM_MISMATCH'
}
if(!(Test-Path $pwFile)){throw 'LOCAL_SECRET_NOT_FOUND'}
$credential=New-Object System.Management.Automation.PSCredential('lobnan_pg_admin',
 (ConvertTo-SecureString -String ((Get-Content -LiteralPath $pwFile -Raw).Trim())))
try{
 $password=$credential.GetNetworkCredential().Password
 $env:PGPASSWORD=$password
 $psql=Join-Path $bin 'psql.exe'
 $queries="SELECT (SELECT COUNT(*) FROM sync_records WHERE workspace='lobnan_main'),(SELECT COUNT(*) FROM sync_auth_users WHERE workspace='lobnan_main'),(SELECT COUNT(*) FROM sync_commands WHERE workspace='lobnan_main'),(SELECT COUNT(*) FROM sync_events WHERE workspace='lobnan_main')"
 $before=(& $psql -X -w -h 127.0.0.1 -p 5432 -U lobnan_pg_admin -d lobnan_main -tAc $queries)
 if($LASTEXITCODE -ne 0){throw 'CANNOT_VERIFY_MAIN_DATABASE'}
 $numbers=@(($before -join '').Trim().Split('|') | ForEach-Object { [long]$_ })
 if($numbers.Count -ne 4 -or @($numbers | Where-Object {$_ -ne 0}).Count -ne 0){
  throw ('REFUSING_NONEMPTY_ACCOUNTING_DATABASE: '+($numbers -join '|'))
 }
 $archive=Join-Path $root 'backups\approved-source-2026-11-07'
 New-Item -ItemType Directory -Path $archive -Force | Out-Null
 $archived=Join-Path $archive 'approved-2026-11-07.json'
 if(Test-Path $archived){
  if((Get-FileHash -LiteralPath $archived -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash){
   throw 'ARCHIVED_SOURCE_HASH_CONFLICT'
  }
 } else {
  Copy-Item -LiteralPath $source -Destination $archived -ErrorAction Stop
 }
 if((Get-FileHash -LiteralPath $archived -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash){
  throw 'ARCHIVE_COPY_FAILED_VERIFICATION'
 }
 # Capture the untouched database before migration; a separate backup is never overwritten.
 & (Join-Path $repo 'scripts\backup-local-db.ps1')
 if($LASTEXITCODE -ne 0){throw 'BASELINE_BACKUP_FAILED'}
 $env:DATABASE_URL='postgres://lobnan_pg_admin:'+([uri]::EscapeDataString($password))+'@127.0.0.1:5432/lobnan_main'
 $env:SYNC_WORKSPACE='lobnan_main'
 Push-Location $repo
 try{
  & node 'local-server/import-legacy-snapshot.mjs' $archived
  if($LASTEXITCODE -ne 0){throw 'SNAPSHOT_VALIDATION_FAILED'}
  & node 'local-server/import-legacy-snapshot.mjs' $archived --apply --confirm-empty-workspace
  if($LASTEXITCODE -ne 0){throw 'SNAPSHOT_IMPORT_FAILED'}
 } finally {Pop-Location}
 $after=(& $psql -X -w -h 127.0.0.1 -p 5432 -U lobnan_pg_admin -d lobnan_main -tAc "SELECT (SELECT COUNT(*) FROM sync_records WHERE workspace='lobnan_main'),(SELECT COUNT(*) FROM sync_records WHERE workspace='lobnan_main' AND entity='invoices'),(SELECT COUNT(*) FROM sync_auth_users WHERE workspace='lobnan_main'),(SELECT COUNT(*) FROM sync_records WHERE workspace='lobnan_main' AND entity='users' AND value ? 'password')")
 if($LASTEXITCODE -ne 0){throw 'IMPORT_VERIFY_QUERY_FAILED'}
 $values=@(($after -join '').Trim().Split('|') | ForEach-Object {[int]$_})
 if($values.Count -ne 4 -or $values[0] -ne 679 -or $values[1] -ne 66 -or $values[2] -ne 5 -or $values[3] -ne 0){
  throw ('IMPORT_COUNTS_MISMATCH_REVIEW_REQUIRED: '+($values -join '|'))
 }
 Write-Host 'APPROVED_MIGRATION_VERIFIED: 679 records, 66 invoices, 5 users, 0 plaintext-password profiles'
 Write-Host 'SOURCE_AND_OLD_ARCHIVES_RETAINED'
}finally{
 Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
 Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
 Remove-Item Env:SYNC_WORKSPACE -ErrorAction SilentlyContinue
 $password=$null
 $credential=$null
}
