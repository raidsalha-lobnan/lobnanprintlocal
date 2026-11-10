# Operator-only: move "رصيد جوال" to ACC-00002 and release PRI-00025.
# Usage: powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\move-mobile-credit-to-acc.ps1" -Apply
param([switch]$Apply)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$maintenance=Join-Path $root 'local-server\mobile-credit-acc-maintenance.mjs'
$backupScript=Join-Path $PSScriptRoot 'backup-local-db.ps1'
$startApi=Join-Path $PSScriptRoot 'start-secure-sync.ps1'
if(!$Apply){Write-Host 'No writes. Re-run with -Apply after confirming all devices have synchronized.';return}
if(!(Test-Path -LiteralPath $maintenance)){throw 'MIGRATION_SCRIPT_MISSING'}
Write-Host 'This changes ONE existing item only, preserving all prices, stock, invoices, and ledger amounts.'
Write-Host 'PRI-00025 will be released for a DIFFERENT, newly created printing item.'
$confirmation=Read-Host 'Type ALL_DEVICES_SYNCED_AND_READY_TO_PAUSE'
if($confirmation -cne 'ALL_DEVICES_SYNCED_AND_READY_TO_PAUSE'){throw 'OFFLINE_QUEUES_NOT_CONFIRMED'}
$listener=Get-NetTCPConnection -LocalPort 4577 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if($listener){
  $proc=Get-CimInstance Win32_Process -Filter ("ProcessId="+$listener.OwningProcess)
  if(!$proc -or $proc.Name -ne 'node.exe' -or
    $proc.CommandLine -notmatch 'local-server[\\/]server\.mjs') {
    throw 'API_PORT_4577_OWNED_BY_UNRECOGNIZED_PROCESS'
  }
  $health=Invoke-RestMethod -Uri 'http://127.0.0.1:4577/api/v1/health' -TimeoutSec 5
  if($health.ok -ne $true -or $health.workspace -ne 'lobnan_main' -or $health.authMode -ne 'users'){
    throw 'UNRECOGNIZED_API_DO_NOT_STOP'
  }
  Stop-Process -Id $proc.ProcessId -ErrorAction Stop
  Start-Sleep -Seconds 2
}
if(Get-NetTCPConnection -LocalPort 4577 -State Listen -ErrorAction SilentlyContinue){
 throw 'SYNC_API_STILL_RUNNING'
}
Write-Host 'Sync API paused. PostgreSQL will remain online.'
$private='D:\LobnanData\private\postgres-password.dpapi'
if(!(Test-Path $private)){throw 'PG_CREDENTIAL_UNAVAILABLE'}
$secure=ConvertTo-SecureString -String ((Get-Content -LiteralPath $private -Raw).Trim())
$cred=New-Object System.Management.Automation.PSCredential('lobnan_pg_admin',$secure)
$backupRoot=Join-Path 'D:\LobnanData\backups' ('mobile-credit-acc-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
try{
 $env:DATABASE_URL='postgres://lobnan_pg_admin:'+([Uri]::EscapeDataString($cred.GetNetworkCredential().Password))+'@127.0.0.1:5432/lobnan_main'
 & $backupScript -BackupDirectory $backupRoot
 $backup=Get-ChildItem -LiteralPath $backupRoot -File -Filter 'lobnan-main-*.dump' |
   Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
 if(!$backup -or !(Test-Path -LiteralPath $backup) -or (Get-Item -LiteralPath $backup).Length -lt 100000){
    throw 'FRESH_BACKUP_NOT_VERIFIED'
 }
 & node $maintenance --dry-run
 if($LASTEXITCODE -ne 0){throw 'DRY_RUN_FAILED__NO_CHANGES_COMMITTED'}
 Write-Host 'Dry run succeeded and rolled back. No changes have been committed yet.'
 $final=Read-Host 'Type RELEASE_PRI00025_MOVE_ACC00002 to commit'
 if($final -cne 'RELEASE_PRI00025_MOVE_ACC00002'){throw 'COMMIT_NOT_AUTHORIZED'}
 $env:CATALOG_BACKUP_FILE=$backup
 $env:CATALOG_APPLY_AUTH='MOVE_MOBILE_CREDIT_AND_RELEASE_PRI00025'
 & node $maintenance --apply
 if($LASTEXITCODE -ne 0){throw 'MIGRATION_FAILED__KEEP_API_STOPPED'}
 $psql='D:\LobnanData\pgsql-17\pgsql\bin\psql.exe'
 $env:PGPASSWORD=$cred.GetNetworkCredential().Password
 $sql=@'
SELECT 'item_code' AS metric,value->>'code' AS val
FROM sync_records WHERE workspace='lobnan_main' AND entity='inventory'
AND record_id='inv-1794294589279-upscd' AND value IS NOT NULL
UNION ALL SELECT 'item_category',value->>'category'
FROM sync_records WHERE workspace='lobnan_main' AND entity='inventory'
AND record_id='inv-1794294589279-upscd' AND value IS NOT NULL
UNION ALL SELECT 'active_PRI_00025',COUNT(*)::text
FROM sync_records WHERE workspace='lobnan_main' AND entity='inventory' AND value IS NOT NULL
AND value->>'code'='PRI-00025'
UNION ALL SELECT 'reserved_PRI_00025',COUNT(*)::text
FROM sync_catalog_code_history WHERE workspace='lobnan_main' AND normalized_code='pri-00025'
UNION ALL SELECT 'group_PRI',COUNT(*)::text
FROM sync_records WHERE workspace='lobnan_main' AND entity='inventory' AND value IS NOT NULL AND value->>'category'='print_raw'
UNION ALL SELECT 'group_BOK',COUNT(*)::text
FROM sync_records WHERE workspace='lobnan_main' AND entity='inventory' AND value IS NOT NULL AND value->>'category'='stationery'
UNION ALL SELECT 'group_ACC',COUNT(*)::text
FROM sync_records WHERE workspace='lobnan_main' AND entity='inventory' AND value IS NOT NULL AND value->>'category'='office_supplies';
'@
 $lines=@(& $psql -X -w -tA -F '|' -v ON_ERROR_STOP=1 -h 127.0.0.1 -U lobnan_pg_admin -d lobnan_main -c $sql)
 if($LASTEXITCODE -ne 0){throw 'POST_COMMIT_VERIFICATION_QUERY_FAILED'}
 $observed=@{}
 foreach($line in $lines){
   $parts=([string]$line).Split('|')
   if($parts.Count -eq 2){$observed[$parts[0]]=$parts[1]}
 }
 $expected=@{
  item_code='ACC-00002';item_category='office_supplies';
  active_PRI_00025='0';reserved_PRI_00025='0';group_PRI='24';group_BOK='2';group_ACC='2'
 }
 foreach($key in $expected.Keys){
   if(!$observed.ContainsKey($key) -or $observed[$key] -cne $expected[$key]){
     throw ('POST_COMMIT_VALIDATION_FAILED_'+$key)
   }
 }
 Write-Host 'VERIFIED: Mobile credit now ACC-00002. PRI-00025 released for next new printing item.'
 & $startApi -FrontendOrigin 'https://lobnanprintlocal.vercel.app,https://lobnanprintlocal-secure.vercel.app'
 if($LASTEXITCODE -ne 0){throw 'POST_MIGRATION_API_RESTART_FAILED'}
 Write-Host 'API restarted. Reopen app and refresh all devices before any further entry.'
}finally{
 Remove-Item Env:DATABASE_URL,Env:PGPASSWORD,Env:CATALOG_BACKUP_FILE,Env:CATALOG_APPLY_AUTH -ErrorAction SilentlyContinue
 $cred=$null
 $secure=$null
}
