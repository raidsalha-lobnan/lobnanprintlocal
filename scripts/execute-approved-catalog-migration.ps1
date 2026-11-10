# Local operator-only maintenance command. Do not execute through an unattended agent.
# Usage after all devices are synchronized and the API at localhost:4577 is stopped:
#   powershell.exe -NoProfile -File .\scripts\execute-approved-catalog-migration.ps1 -Apply
param([switch]$Apply, [switch]$DryRunOnly)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$server=Join-Path $root 'local-server\catalog-maintenance-2026-11-10.mjs'
$backupScript=Join-Path $PSScriptRoot 'backup-local-db.ps1'
if(!(Test-Path -LiteralPath $server)){throw 'MIGRATION_SCRIPT_MISSING'}
if(!$Apply -and !$DryRunOnly){
  Write-Host 'No changes made. Re-run with -DryRunOnly or -Apply after completing the maintenance checklist.'
  return
}
if($Apply -and $DryRunOnly){throw 'SELECT_ONLY_ONE_MODE'}
$listener=Get-NetTCPConnection -LocalPort 4577 -State Listen -ErrorAction SilentlyContinue
if($listener){throw 'SYNC_API_IS_RUNNING: Stop the local API so no devices can write during migration.'}
Write-Host 'Precondition: all devices synced and all pending offline actions resolved.'
Write-Host 'Precondition: devices are closed/paused; local sync API is stopped; PostgreSQL stays online.'
$typed=Read-Host 'Type ALL_DEVICES_SYNCED_AND_API_STOPPED to continue'
if($typed -cne 'ALL_DEVICES_SYNCED_AND_API_STOPPED'){throw 'OPERATOR_PRECONDITIONS_NOT_CONFIRMED'}
$private='D:\LobnanData\private\postgres-password.dpapi'
if(!(Test-Path -LiteralPath $private)){throw 'PRIVATE_CREDENTIAL_FILE_MISSING'}
$secure=ConvertTo-SecureString -String ((Get-Content -LiteralPath $private -Raw).Trim())
$cred=New-Object System.Management.Automation.PSCredential('lobnan_pg_admin',$secure)
$backupRoot=Join-Path 'D:\LobnanData\backups' ('catalog-105-confirmed-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
$backupFile=$null
try {
  $env:DATABASE_URL='postgres://lobnan_pg_admin:'+([Uri]::EscapeDataString($cred.GetNetworkCredential().Password))+'@127.0.0.1:5432/lobnan_main'
  & $backupScript -BackupDirectory $backupRoot
  $backupFile=Get-ChildItem -LiteralPath $backupRoot -Filter 'lobnan-main-*.dump' -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
  if(!$backupFile -or !(Test-Path -LiteralPath $backupFile)){throw 'FRESH_BACKUP_NOT_VERIFIED'}
  if((Get-Item -LiteralPath $backupFile).Length -lt 100000){throw 'FRESH_BACKUP_TOO_SMALL'}
  & node $server --dry-run
  if($LASTEXITCODE -ne 0){throw 'CATALOG_DRY_RUN_FAILED; NO DATABASE CHANGES SHOULD BE COMMITTED'}
  Write-Host 'Successful dry run was rolled back. The database has NOT yet been changed.'
  if($DryRunOnly){return}
  $final=Read-Host 'Type APPLY_105_INVOICES_102_PRINT_ORDERS to authorize commit'
  if($final -cne 'APPLY_105_INVOICES_102_PRINT_ORDERS'){throw 'COMMIT_NOT_AUTHORIZED'}
  $env:CATALOG_BACKUP_FILE=$backupFile
  $env:CATALOG_APPLY_AUTH='APPROVED_PRI_BOK_ACC_AND_102_ARCHIVE'
  & node $server --apply
  if($LASTEXITCODE -ne 0){throw 'MIGRATION_FAILED; KEEP API STOPPED AND REVIEW ERROR BEFORE RESTART'}
  Write-Host 'Migration reported success. Verifying counts before restarting the API.'
  $env:PGPASSWORD=$cred.GetNetworkCredential().Password
  $psql='D:\LobnanData\pgsql-17\pgsql\bin\psql.exe'
  $query=@'
SELECT 'invoices' AS metric, count(*) AS n FROM sync_records WHERE workspace='lobnan_main' AND entity='invoices' AND value IS NOT NULL
UNION ALL SELECT 'inventory', count(*) FROM sync_records WHERE workspace='lobnan_main' AND entity='inventory' AND value IS NOT NULL
UNION ALL SELECT 'active_print_orders',count(*) FROM sync_records WHERE workspace='lobnan_main' AND entity='printOrders' AND value IS NOT NULL
UNION ALL SELECT 'print_order_reversals',count(*) FROM sync_records WHERE workspace='lobnan_main' AND entity='journalEntries' AND value->>'referenceType'='print_order_void_reversal';
'@
  $lines=@(& $psql -X -w -tA -F '|' -v ON_ERROR_STOP=1 -h 127.0.0.1 -U lobnan_pg_admin -d lobnan_main -c $query)
  if($LASTEXITCODE -ne 0){throw 'POST_MIGRATION_VERIFICATION_FAILED'}
  $observed=@{}
  foreach($line in $lines){
    $pair=([string]$line).Split('|')
    if($pair.Count -eq 2){$observed[$pair[0]]=[int]$pair[1]}
  }
  $expected=@{invoices=105;inventory=28;active_print_orders=0;print_order_reversals=48}
  foreach($name in $expected.Keys){
    if(!$observed.ContainsKey($name) -or $observed[$name] -ne $expected[$name]){
      throw ('POST_MIGRATION_COUNT_MISMATCH_'+$name)
    }
  }
  Write-Host 'Verified: 105 invoices, 28 catalog records, 0 active print orders, 48 reversing journals.'
  Write-Host 'Restart API, then refresh connected devices; verify all reports and no pending offline queue before new invoices.'
} finally {
  Remove-Item Env:DATABASE_URL,Env:CATALOG_BACKUP_FILE,Env:CATALOG_APPLY_AUTH,Env:PGPASSWORD -ErrorAction SilentlyContinue
  $cred=$null
  $secure=$null
}
