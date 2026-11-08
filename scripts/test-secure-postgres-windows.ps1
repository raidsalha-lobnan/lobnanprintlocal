# Run integration tests against a new, disposable PostgreSQL database.
# Never runs against lobnan_main. Secrets never leave this Windows account.
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$bin='D:\LobnanData\pgsql-17\pgsql\bin'
$secret='D:\LobnanData\private\postgres-password.dpapi'
if(!(Test-Path $secret)){throw 'PRIVATE_PASSWORD_MISSING'}
$encryptedText=(Get-Content $secret -Raw).Trim()
$credential=New-Object System.Management.Automation.PSCredential('lobnan_pg_admin',(ConvertTo-SecureString -String $encryptedText))
$db='lobnan_test_'+[guid]::NewGuid().ToString('N').Substring(0,16)
$created=$false
try {
  $password=$credential.GetNetworkCredential().Password
  $env:PGPASSWORD=$password
  & (Join-Path $bin 'createdb.exe') -h 127.0.0.1 -U lobnan_pg_admin $db
  if($LASTEXITCODE -ne 0){throw 'ISOLATED_DATABASE_CREATION_FAILED'}
  $created=$true
  $env:DATABASE_URL='postgres://lobnan_pg_admin:'+([uri]::EscapeDataString($password))+'@127.0.0.1:5432/'+$db
  $env:SYNC_WORKSPACE='lobnan_main'
  Push-Location $root
  try{
    & node --test 'local-server/tests/auth-postgres-integration.test.mjs'
    if($LASTEXITCODE -ne 0){throw 'POSTGRES_INTEGRATION_TEST_FAILED'}
    Write-Host 'ISOLATED_POSTGRES_INTEGRATION_PASSED'
  }finally{Pop-Location}
}finally{
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  if($created){
    & (Join-Path $bin 'dropdb.exe') -h 127.0.0.1 -U lobnan_pg_admin --if-exists $db
    if($LASTEXITCODE -ne 0){Write-Warning 'Test database cleanup failed; investigate the isolated test database'}
  }
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $password=$null
  $credential=$null
}
