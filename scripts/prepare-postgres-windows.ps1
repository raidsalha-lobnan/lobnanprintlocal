# Prepare a NEW PostgreSQL 17 cluster on D: without touching existing app files.
# Run only on the main Windows computer after confirming the D: drive is available.
# User credentials never enter GitHub. Requires an admin-controlled Windows session.
$ErrorActionPreference='Stop'
$root='D:\LobnanData'
$archive=Join-Path $root 'downloads\postgresql-17.11-1-windows-x64-binaries.zip'
$install=Join-Path $root 'pgsql-17'
$data=Join-Path $root 'pgdata'
$private=Join-Path $root 'private'
$encrypted=Join-Path $private 'postgres-password.dpapi'
$pgLog=Join-Path $root 'postgres.log'
$url='https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64-binaries.zip'

if(!(Test-Path 'D:\')){throw 'D: drive not available. Refusing to write to crowded C: drive.'}
$free=(Get-PSDrive D).Free
if($free -lt 6GB){throw 'Need at least 6 GB free on D: for a safe PostgreSQL installation.'}
New-Item -ItemType Directory -Path (Split-Path $archive),$install,$private -Force | Out-Null
if(!(Test-Path $archive) -or (Get-Item $archive).Length -ne 340719294){
  Write-Host 'Downloading official PostgreSQL 17.11 binary package to D:'
  Invoke-WebRequest -Uri $url -OutFile ($archive+'.partial') -UseBasicParsing -TimeoutSec 900
  if((Get-Item ($archive+'.partial')).Length -ne 340719294){throw 'Incomplete download. Verify PostgreSQL package size.'}
  Move-Item ($archive+'.partial') $archive -Force
}
$bin=Join-Path $install 'pgsql\bin'
if(!(Test-Path (Join-Path $bin 'initdb.exe'))){
  Write-Host 'Extracting to an isolated D: folder...'
  Expand-Archive -LiteralPath $archive -DestinationPath $install -Force
}
$initdb=Join-Path $bin 'initdb.exe'
$ctl=Join-Path $bin 'pg_ctl.exe'
$createdb=Join-Path $bin 'createdb.exe'
if(!(Test-Path $initdb)){throw 'PostgreSQL executable missing from package'}
if(Test-Path (Join-Path $data 'PG_VERSION')){
  Write-Host 'An existing PostgreSQL data cluster was detected. No initialization or credential changes will occur.' -ForegroundColor Yellow
  Write-Host 'Do not delete D:\LobnanData\pgdata. Review it before starting another instance.'
  exit 0
}
New-Item -ItemType Directory -Path $data -Force | Out-Null
$pwFile=Join-Path $private ('pg-first-init-'+[guid]::NewGuid().ToString('N')+'.tmp')
$bytes=New-Object byte[] 32
$rng=[System.Security.Cryptography.RandomNumberGenerator]::Create()
try {$rng.GetBytes($bytes)}finally{$rng.Dispose()}
$password=-join ($bytes|ForEach-Object {$_.ToString('x2')})
$secure=ConvertTo-SecureString $password -AsPlainText -Force
$secure|ConvertFrom-SecureString|Set-Content -Path $encrypted -Encoding Ascii
[System.IO.File]::WriteAllText($pwFile,$password+[Environment]::NewLine,(New-Object System.Text.UTF8Encoding $false))
try {
  & $initdb -D $data -U lobnan_pg_admin -A scram-sha-256 --pwfile=$pwFile --encoding=UTF8
  if($LASTEXITCODE -ne 0){throw 'PostgreSQL initdb failed; do not delete partially created cluster.'}
}finally{
  Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue
  $password=$null
}
$conf=Join-Path $data 'postgresql.conf'
Add-Content -Path $conf -Value @"

# Lobnan accounting: local-only binding. zrok connects to HTTP API, NEVER port 5432.
listen_addresses = '127.0.0.1'
port = 5432
password_encryption = 'scram-sha-256'
"@
Write-Host 'Starting PostgreSQL on loopback only'
& $ctl -D $data -l $pgLog -o '-h 127.0.0.1 -p 5432' -w start
if($LASTEXITCODE -ne 0){throw 'PostgreSQL startup failed. Review D:\LobnanData\postgres.log'}
$secure=Get-Content -LiteralPath $encrypted -Raw|ConvertTo-SecureString
$cred=New-Object System.Management.Automation.PSCredential('lobnan_pg_admin',$secure)
$env:PGPASSWORD=$cred.GetNetworkCredential().Password
try {
  & $createdb -h 127.0.0.1 -p 5432 -U lobnan_pg_admin lobnan_main
  if($LASTEXITCODE -ne 0){throw 'Unable to create the empty accounting database'}
}finally{$env:PGPASSWORD=$null}
Write-Host 'POSTGRES_CREATED: lobnan_main at 127.0.0.1:5432 (private, empty)' -ForegroundColor Green
Write-Host 'Next: import a verified fresh snapshot with the private migration script, then start the user-authenticated API.'
Write-Host 'PostgreSQL startup is not yet a persistent Windows service; do not assume it will survive a reboot.'
