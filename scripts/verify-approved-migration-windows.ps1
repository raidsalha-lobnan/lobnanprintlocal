# Read-only verification of the committed production migration; safe to rerun.
$ErrorActionPreference='Stop'
$bin='D:\LobnanData\pgsql-17\pgsql\bin'
$secret='D:\LobnanData\private\postgres-password.dpapi'
if(!(Test-Path $secret)){throw 'CREDENTIAL_MISSING'}
$credential=New-Object System.Management.Automation.PSCredential('lobnan_pg_admin',
  (ConvertTo-SecureString -String ((Get-Content $secret -Raw).Trim())))
try {
  $env:PGPASSWORD=$credential.GetNetworkCredential().Password
  $sql="SELECT (SELECT COUNT(*) FROM sync_records WHERE workspace='lobnan_main'),(SELECT COUNT(*) FROM sync_records WHERE workspace='lobnan_main' AND entity='invoices'),(SELECT COUNT(*) FROM sync_auth_users WHERE workspace='lobnan_main'),(SELECT COUNT(*) FROM sync_records WHERE workspace='lobnan_main' AND entity='users' AND value ? 'password'),(SELECT COUNT(*) FROM invoice_claims WHERE workspace='lobnan_main')"
  $out=& (Join-Path $bin 'psql.exe') -X -w -h 127.0.0.1 -p 5432 -U lobnan_pg_admin -d lobnan_main -tAc $sql
  if($LASTEXITCODE -ne 0){throw 'POSTGRES_READ_FAILED'}
  $values=@(($out -join '').Trim().Split('|') | ForEach-Object {[int]$_})
  if($values.Count -ne 5 -or $values[0] -ne 679 -or $values[1] -ne 66 -or $values[2] -ne 5 -or $values[3] -ne 0 -or $values[4] -ne 66){
    throw ('MIGRATION_RESULT_UNEXPECTED: '+($values -join '|'))
  }
  Write-Host 'PRODUCTION_MIGRATION_VERIFIED: records=679 invoices=66 users=5 plaintext-passwords=0 unique-invoice-claims=66'
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $credential=$null
}
