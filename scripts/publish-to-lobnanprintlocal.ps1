# Run from Windows PowerShell within the extracted project folder.
# Requires Git and GitHub authentication (e.g., browser sign-in by Git Credential Manager).
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$repo = 'https://github.com/raidsalha-lobnan/lobnanprintlocal.git'
$branch = 'setup/postgres-offline-review'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git غير مثبت. ثبّت Git for Windows ثم أعد المحاولة.'
}
if (-not (Test-Path '.git')) { git init; if ($LASTEXITCODE -ne 0) { throw 'git init failed' } }
git config --local core.autocrlf false
$origin = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
  if ($origin -ne $repo) { throw "Origin already points to a different repository: $origin" }
} else {
  git remote add origin $repo
  if ($LASTEXITCODE -ne 0) { throw 'Adding origin failed' }
}
# Never publish accounting exports, credentials or local state.
$blocked = @('.env', '.env.local-server', 'master_drive_database_snapshot.json', 'public/master_drive_database_snapshot.json', 'firebase-applet-config.json')
foreach ($path in $blocked) {
  git check-ignore -q -- $path
  if ($LASTEXITCODE -ne 0) { throw "Sensitive path is not ignored: $path" }
}
git switch -c $branch
if ($LASTEXITCODE -ne 0) { throw 'Could not create a safe review branch' }
git add -A
if ($LASTEXITCODE -ne 0) { throw 'git add failed' }
$staged = @(git diff --cached --name-only)
if ($staged.Count -eq 0) { throw 'No files staged for commit' }
foreach ($f in $staged) {
  if ($f -match '(^|/)(\.env($|\.)|\.sync_data/|private-backups/|node_modules/|master_drive_database_snapshot\.json$|firebase-applet-config\.json$)' -or $f -match '\.(sqlite|sqlite3|db|bak)$') {
    throw "Sensitive file staged: $f"
  }
}
Write-Host "Files staged: $($staged.Count)" -ForegroundColor Cyan
Write-Host 'Review the list using: git diff --cached --name-only' -ForegroundColor Yellow
# No force pushes or overwriting the main branch.
git -c user.name='Lobnan Print Local' -c user.email='local@users.noreply.github.com' commit -m 'Initial offline-first PostgreSQL workbench (review required)'
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
git push -u origin "HEAD:refs/heads/$branch"
if ($LASTEXITCODE -ne 0) { throw 'Push failed. Check GitHub login and repository write permissions.' }
Write-Host "Published review branch: $branch" -ForegroundColor Green
Write-Host 'Open the GitHub repository and create a pull request. Do not deploy production without E2E tests.'
