# Complete an already initialized PostgreSQL cluster WITHOUT recreating or overwriting it.
$ErrorActionPreference='Stop'
$root='D:\LobnanData'
$bin=Join-Path $root 'pgsql-17\pgsql\bin'
$data=Join-Path $root 'pgdata'
$secureFile=Join-Path $root 'private\postgres-password.dpapi'
if(!(Test-Path (Join-Path $data 'PG_VERSION'))){throw 'POSTGRES_NOT_INITIALIZED'}
if(!(Test-Path $secureFile)){throw 'PASSWORD_FILE_MISSING'}
if(!(Test-Path (Join-Path $bin 'pg_ctl.exe'))){throw 'POSTGRES_BINARY_MISSING'}
$version=(Get-Content (Join-Path $data 'PG_VERSION') -Raw).Trim()
if($version -ne '17'){throw 'UNEXPECTED_POSTGRES_MAJOR_VERSION'}
$ctl=Join-Path $bin 'pg_ctl.exe'
& $ctl -D $data status | Out-Null
if($LASTEXITCODE -ne 0){
  & $ctl -D $data -l (Join-Path $root 'postgres.log') -o '-h 127.0.0.1 -p 5432' -w start
  if($LASTEXITCODE -ne 0){throw 'POSTGRES_START_FAILED'}
}
$encryptedText=(Get-Content -LiteralPath $secureFile -Raw).Trim()
$secure=ConvertTo-SecureString -String $encryptedText
$credential=New-Object System.Management.Automation.PSCredential('lobnan_pg_admin',$secure)
try {
  $env:PGPASSWORD=$credential.GetNetworkCredential().Password
  $psql=Join-Path $bin 'psql.exe'
  $dbExists=& $psql -X -w -h 127.0.0.1 -p 5432 -U lobnan_pg_admin -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='lobnan_main'"
  if($LASTEXITCODE -ne 0){throw 'PG_AUTHENTICATION_FAILED'}
  if(($dbExists -join '').Trim() -ne '1'){
    & (Join-Path $bin 'createdb.exe') -h 127.0.0.1 -p 5432 -U lobnan_pg_admin lobnan_main
    if($LASTEXITCODE -ne 0){throw 'DATABASE_CREATION_FAILED'}
    Write-Host 'DATABASE_CREATED: lobnan_main'
  }else{Write-Host 'DATABASE_ALREADY_EXISTS: left unchanged'}
  & $psql -X -w -h 127.0.0.1 -p 5432 -U lobnan_pg_admin -d lobnan_main -tAc 'SELECT current_database(),current_user'
  if($LASTEXITCODE -ne 0){throw 'DATABASE_CONNECTIVITY_FAILED'}
  Write-Host 'POSTGRES_PRIVATE_READY'
}finally{
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $credential=$null
  $secure=$null
}
