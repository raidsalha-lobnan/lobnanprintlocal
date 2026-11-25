'use strict';
/**
 * Safe, dependency-free desktop updater for the unsigned, one-click NSIS build.
 * - Download only official GitHub Release installers with SHA-256 digest.
 * - Keep cache on the PINNED storage disk; never touch accounting.db.
 * - Never run a downloaded installer while a cashier window is open.
 * - On the NEXT launch, before any invoice UI is created, verify the installer
 *   again and hand it to a detached, bounded PowerShell process.
 * - The helper waits for this process to exit, installs silently and reopens
 *   the same installed app path. Failed attempts are capped at two.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {
 RELEASES_API,officialAsset,approvedStagedRecord,compareVersions
}=require('./update-policy.cjs');

const RECHECK_MS=5*60*1000;
const DOWNLOAD_TIMEOUT_MS=15*60*1000;
const META_FILE='verified-update.json';
const ATTEMPT_FILE='install-attempt.json';
const MAX_INSTALL_ATTEMPTS=2;
const ALLOWED_DOWNLOAD_HOSTS=new Set([
 'github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'
]);
function atomicJSON(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const tmp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
 const fd=fs.openSync(tmp,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(value),'utf8');fs.fsyncSync(fd);}
 finally{fs.closeSync(fd);}
 try{fs.renameSync(tmp,file);}catch(error){
  try{fs.rmSync(tmp,{force:true});}catch{}throw error;
 }
}
function readJSON(file){
 try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}
}
async function verifiedFile(file,size,digest){
 try{
  const stat=await fs.promises.stat(file);
  if(!stat.isFile()||stat.size!==size)return false;
  const hash=crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file))hash.update(chunk);
  return hash.digest('hex')===digest;
 }catch{return false;}
}
function safelyQuotedPs(value){return "'"+String(value).replace(/'/g,"''")+"'";}
function powershellInstallCommand({oldPid,installer,appExecutable,expectedVersion,interactive=false,handshake,expectedDigest}){
 const installerLiteral=safelyQuotedPs(installer);
 const appLiteral=safelyQuotedPs(appExecutable);
 const workdirLiteral=safelyQuotedPs(path.dirname(appExecutable));
 const version=expectedVersion||/LobnanPrint-Setup-(\d+\.\d+\.\d+)\.exe$/i.exec(installer)?.[1];
 if(!version||!/^\d+\.\d+\.\d+$/.test(version))throw Error('DESKTOP_UPDATE_INVALID_VERSION');
 return [
  '$ErrorActionPreference = "Stop"',
  '$log = '+safelyQuotedPs(path.join(path.dirname(installer),'install-helper.log')),
  '$oldPid = '+Number(oldPid),
  '$installer = '+installerLiteral,
  '$appExe = '+appLiteral,
  '$expected = '+safelyQuotedPs(version),
  '$outcome = "UNKNOWN"',
  '$canReopen = $false',
  'try {',
  '  try { Start-Transcript -Path $log -Append | Out-Null } catch {}',
  ...(handshake?[
   '  $ready = '+safelyQuotedPs(handshake+'.ready'),
   '  $go = '+safelyQuotedPs(handshake+'.go'),
   '  Set-Content -LiteralPath $ready -Value "HELPER_READY" -ErrorAction Stop',
   '  for ($j=0; $j -lt 100; $j++) { if (Test-Path -LiteralPath $go) { break }; Start-Sleep -Milliseconds 200 }',
   '  if (-not (Test-Path -LiteralPath $go)) { throw "HELPER_HANDOFF_NOT_AUTHORIZED" }'
  ]:[]),
  '  for ($i=0; $i -lt 180; $i++) {',
  '    if (-not (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) { break }',
  '    Start-Sleep -Seconds 1',
  '  }',
  '  if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) { throw "OLD_PROCESS_STILL_RUNNING" }',
  '  $canReopen = $true',
  '  for ($i=0; $i -lt 30; $i++) { if (-not (Get-Process LobnanPrint -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Seconds 1 }',
  '  if (Get-Process LobnanPrint -ErrorAction SilentlyContinue) { $canReopen = $false; throw "APP_PROCESS_STILL_RUNNING" }',
  '  if (-not (Test-Path -LiteralPath $installer)) { throw "INSTALLER_NOT_FOUND" }',
  ...(expectedDigest?[
   '  $digest = '+safelyQuotedPs(expectedDigest),
   '  if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $digest) { throw "INSTALLER_CHECKSUM_CHANGED" }'
  ]:[]),
  interactive?'  $result = Start-Process -FilePath $installer -Wait -PassThru':'  $result = Start-Process -FilePath $installer -ArgumentList @("/S") -Wait -PassThru',
  '  Write-Output ("Installer exit code: " + $result.ExitCode)',
  '  if ($result.ExitCode -ne 0) { throw ("INSTALLER_EXIT_" + $result.ExitCode) }',
  '  if (-not (Test-Path -LiteralPath $appExe)) { throw "APP_EXECUTABLE_NOT_FOUND" }',
  '  $actual = (Get-Item -LiteralPath $appExe).VersionInfo.FileVersion',
  '  Write-Output ("Installed file version: " + $actual + "; expected: " + $expected)',
  '  if ([version]$actual -lt [version]$expected) { throw ("INSTALLED_VERSION_MISMATCH_" + $actual) }',
  '  $outcome = "VERIFIED_INSTALLED"',
  '} catch {',
  '  $outcome = $_.Exception.Message',
  '  Write-Output ("UPDATE_FAILED: " + $outcome)',
  '} finally {',
  '  try { $outcome | Set-Content -LiteralPath (Join-Path (Split-Path -Parent $installer) "install-result.txt") -Encoding UTF8 } catch {}',
  '  try { Stop-Transcript | Out-Null } catch {}',
  '  if ($canReopen -and (Test-Path -LiteralPath $appExe)) {',
  '    try { Start-Process -FilePath '+appLiteral+' -WorkingDirectory '+workdirLiteral+' -ArgumentList @("--lobnan-update-return") } catch { Write-Output ("REOPEN_FAILED: " + $_.Exception.Message) }',
  '  }',
  '}',
  'if ($outcome -eq "VERIFIED_INSTALLED") { exit 0 } else { exit 6 }'
 ].join('\r\n');
}
async function startDetachedInstaller({oldPid,installer,appExecutable,expectedVersion,interactive=false,expectedDigest},launch=spawn){
 if(process.platform!=='win32')return false;
 const dir=path.dirname(installer);
 const handshake=path.join(dir,'helper-'+crypto.randomBytes(12).toString('hex'));
 const systemRoot=process.env.SystemRoot||process.env.WINDIR||'C:\\Windows';
 const executable=path.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 const ps=powershellInstallCommand({oldPid,installer,appExecutable,expectedVersion,interactive,expectedDigest,handshake});
 const encoded=Buffer.from(ps,'utf16le').toString('base64');
 // Use the Windows Start-Process path that works in the operator's test.
 // The bootstrap exits independently; the worker has its own stdout/stderr.
 const bootstrap=[
  '$ErrorActionPreference = "Stop"',
  '$p = Start-Process -FilePath '+safelyQuotedPs(executable)+' -ArgumentList @("-NoLogo","-NoProfile","-NonInteractive","-EncodedCommand",'+safelyQuotedPs(encoded)+') -WindowStyle Hidden -RedirectStandardOutput '+safelyQuotedPs(path.join(dir,'install-worker.stdout.log'))+' -RedirectStandardError '+safelyQuotedPs(path.join(dir,'install-worker.stderr.log'))+' -PassThru',
  'Write-Output ("WORKER_PID=" + $p.Id)'
 ].join('\r\n');
 const launcherLog=path.join(dir,'install-launcher.log');
 let fd,child;
 let launchError=null,exitCode=null;
 const note=message=>{try{fs.appendFileSync(launcherLog,new Date().toISOString()+' '+message+'\n');}catch{}};
 try{
  fd=fs.openSync(launcherLog,'a');
  child=launch(executable,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(bootstrap,'utf16le').toString('base64')],{
   detached:true,stdio:['ignore',fd,fd],windowsHide:true,cwd:dir
  });
  child.once('error',error=>{launchError=error;note('BOOTSTRAP_ERROR '+String(error));});
  child.once('exit',code=>{exitCode=code;note('BOOTSTRAP_EXIT '+code);});
  child.unref();
 }catch(error){note('SPAWN_FAILED '+String(error));return false;}
 finally{if(fd!==undefined)fs.closeSync(fd);}
 const deadline=Date.now()+10000;
 while(Date.now()<deadline){
  if(launchError||(exitCode!==null&&exitCode!==0))break;
  if(fs.existsSync(handshake+'.ready')){
   try{
    fs.writeFileSync(handshake+'.go','AUTHORIZED',{flag:'wx'});
    note('HELPER_READY_HANDOFF_AUTHORIZED '+expectedVersion);
    return true;
   }catch(error){note('HANDOFF_FAILED '+String(error));break;}
  }
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 note('HELPER_NOT_READY — keeping current app open');
 return false;
}
function createDesktopUpdateService({app,storage,getWindow,launchInstaller=startDetachedInstaller,fetchImpl=fetch,differentialDownload=null}){
 const cacheDir=path.join(storage.root,'UpdateCache');
 const metadataPath=path.join(cacheDir,META_FILE);
 const attemptsPath=path.join(cacheDir,ATTEMPT_FILE);
 const previousAttempt=readJSON(attemptsPath);
 let installedVersion=null;
 try{
  if(previousAttempt?.version&&compareVersions(app.getVersion(),previousAttempt.version)>=0)
   installedVersion=app.getVersion();
 }catch{}
 function installDiagnostic(){
  try{return fs.readFileSync(path.join(cacheDir,'install-result.txt'),'utf8').replace(/^\uFEFF/,'').trim().slice(0,400);}
  catch{return '';}
 }
 let status={phase:'idle',currentVersion:app.getVersion(),version:null,percent:null,installedVersion,errorDetail:null,downloadMode:null};
 let task=null,stopped=false,timer=null,failures=0;
 function setStatus(phase,extra={}){
  status={...status,errorDetail:null,...extra,phase};
  const window=getWindow();
  if(window&&!window.isDestroyed()){
   try{window.webContents.send('lobnan:desktop-update-status',status);}catch{}
  }
 }
 function getStatus(){return {...status};}
 async function checkStaged(){
  const record=approvedStagedRecord(readJSON(metadataPath),app.getVersion());
  if(!record)return null;
  const file=path.join(cacheDir,record.fileName);
  return await verifiedFile(file,record.size,record.digest)
   ?{...record,file}:null;
 }
 function logFailure(stage,error,version){
  const detail=String(error?.message||error)+(error?.cause?.code?' ['+error.cause.code+']':'');
  try{
   fs.mkdirSync(cacheDir,{recursive:true});
   const file=path.join(cacheDir,'update-errors.log');
   if(fs.existsSync(file)&&fs.statSync(file).size>128000)fs.renameSync(file,file+'.previous');
   fs.appendFileSync(file,new Date().toISOString()+' '+stage+' '+(version||'-')+' '+detail.slice(0,500)+'\n');
  }catch{}
  return detail.slice(0,400);
 }
 async function stageRelease(asset){
  fs.mkdirSync(cacheDir,{recursive:true});
  const file=path.join(cacheDir,asset.fileName);
  const temp=path.join(cacheDir,asset.fileName+'.'+asset.digest+'.part');
  const commit=async()=>{
   // Only this versioned installer is replaced; accounting storage is untouched.
   if(!(await verifiedFile(file,asset.size,asset.digest))){
    await fs.promises.rm(file,{force:true});
    await fs.promises.rename(temp,file);
   }else await fs.promises.rm(temp,{force:true});
   atomicJSON(metadataPath,{version:asset.version,fileName:asset.fileName,size:asset.size,digest:asset.digest});
   return true;
  };
  if(await verifiedFile(file,asset.size,asset.digest))return commit();
  // Preserve the trusted installer staging and independent install handoff.
  // Electron Updater only reconstructs the installer from unchanged blocks.
  if(differentialDownload&&!fs.existsSync(temp)){
   try{
    setStatus('downloading',{version:asset.version,percent:0,downloadMode:'differential'});
    const reconstructed=await differentialDownload({
     app,asset,cacheDir,fetchImpl,verifiedFile,
     onProgress:percent=>setStatus('downloading',{version:asset.version,percent,downloadMode:'differential'}),
     log:message=>{try{fs.appendFileSync(path.join(cacheDir,'differential-update.log'),new Date().toISOString()+' '+String(message).slice(0,1000)+'\n');}catch{}}
    });
    if(!await verifiedFile(reconstructed,asset.size,asset.digest))throw Error('DELTA_OFFICIAL_SHA256_MISMATCH');
    await fs.promises.copyFile(reconstructed,temp);
    if(!await verifiedFile(temp,asset.size,asset.digest))throw Error('DELTA_COPY_VERIFICATION_FAILED');
    return await commit();
   }catch(error){
    logFailure('differential',error,asset.version);
    await fs.promises.rm(temp,{force:true});
   }
  }
  setStatus('downloading',{version:asset.version,percent:0,downloadMode:'full'});
  let bytes=0;
  try{bytes=(await fs.promises.stat(temp)).size;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(bytes>asset.size){await fs.promises.rm(temp,{force:true});bytes=0;}
  if(bytes===asset.size){
   if(await verifiedFile(temp,asset.size,asset.digest))return commit();
   await fs.promises.rm(temp,{force:true});bytes=0;
  }
  const headers={'User-Agent':'LobnanPrint-Windows-Updater','Accept-Encoding':'identity'};
  if(bytes)headers.Range='bytes='+bytes+'-';
  setStatus('downloading',{version:asset.version,percent:Math.floor(bytes*100/asset.size)});
  const response=await fetchImpl(asset.url,{
   headers,redirect:'follow',signal:AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
  });
  if(response.status===416&&bytes){await fs.promises.rm(temp,{force:true});}
  if(!response.ok||!response.body||!ALLOWED_DOWNLOAD_HOSTS.has(new URL(response.url).hostname)){
   await response.body?.cancel?.().catch(()=>{});
   throw Error('DESKTOP_UPDATE_DOWNLOAD_HTTP_'+(response.status||'UNKNOWN'));
  }
  // A server that ignores Range sends a complete 200; safely restart.
  if(response.status===206){
   const range=response.headers?.get('content-range');
   const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(range||'');
   if(!match||Number(match[1])!==bytes||Number(match[2])!==asset.size-1||Number(match[3])!==asset.size){
    await response.body?.cancel?.().catch(()=>{});
    await fs.promises.rm(temp,{force:true});
    throw Error('DESKTOP_UPDATE_RANGE_INVALID');
   }
  }else if(response.status===200||response.status===undefined)bytes=0;
  else throw Error('DESKTOP_UPDATE_DOWNLOAD_HTTP_'+response.status);
  const handle=await fs.promises.open(temp,bytes?'a':'w',0o600);
  try{
   for await(const piece of response.body){
    const chunk=Buffer.from(piece);
    if(bytes+chunk.length>asset.size){
     await handle.truncate(0);throw Error('DESKTOP_UPDATE_SIZE_EXCEEDED');
    }
    let offset=0;
    while(offset<chunk.length){
     const {bytesWritten}=await handle.write(chunk,offset,chunk.length-offset);
     if(bytesWritten<=0)throw Error('DESKTOP_UPDATE_INCOMPLETE_FILE_WRITE');
     offset+=bytesWritten;bytes+=bytesWritten;
    }
    const percent=Math.floor(bytes*100/asset.size);
    if(percent!==status.percent)setStatus('downloading',{version:asset.version,percent});
   }
   await handle.sync();
  }finally{await handle.close();}
  // Keep a partial download on transient interruption. Never execute it.
  if(bytes!==asset.size)throw Error('DESKTOP_UPDATE_DOWNLOAD_INCOMPLETE');
  if(!(await verifiedFile(temp,asset.size,asset.digest))){
   await fs.promises.rm(temp,{force:true});
   throw Error('DESKTOP_UPDATE_CHECKSUM_INVALID');
  }
  return commit();
 }
 async function checkNow(){
  if(stopped||!app.isPackaged||process.platform!=='win32')return getStatus();
  if(task)return task;
  task=(async()=>{
   let staged=null,blocked=false,requestedVersion=null;
   try{
    staged=await checkStaged();
    const attempts=readJSON(attemptsPath);
    blocked=Boolean(staged&&attempts?.version===staged.version&&
      Number(attempts.count)>=MAX_INSTALL_ATTEMPTS);
    // A failed staged release must not prevent future releases from being
    // discovered. Keep the old file intact until a newer asset is verified.
    setStatus('checking',{percent:null,version:null,downloadMode:null});
    const res=await fetchImpl(RELEASES_API,{
     headers:{Accept:'application/vnd.github+json',
      'User-Agent':'LobnanPrint-Windows-Updater'},
     signal:AbortSignal.timeout(30000),cache:'no-store'
    });
    if(!res.ok)throw Error('DESKTOP_UPDATE_RELEASE_QUERY_'+res.status);
    const release=await res.json();
    const asset=officialAsset(release,app.getVersion());
    if(staged&&(!asset||compareVersions(asset.version,staged.version)<=0)){
     failures=0;
     setStatus(blocked?'install-error':'ready',{version:staged.version,percent:100,
      errorDetail:blocked?(installDiagnostic()||'INSTALL_ATTEMPTS_EXHAUSTED'):null});
     return getStatus();
    }
    if(!asset){failures=0;setStatus('current',{version:null,percent:null});return getStatus();}
    requestedVersion=asset.version;
    setStatus('downloading',{version:asset.version,percent:0});
    await stageRelease(asset);
    setStatus('ready',{version:asset.version,percent:100});
   }catch(error){
    const detail=logFailure(requestedVersion?'download':'check',error,requestedVersion);
    failures++;
    console.warn('DESKTOP_UPDATE_CHECK_FAILED',detail);
    if(staged&&!blocked){
     setStatus('ready',{version:staged.version,percent:100});
    }else if(staged&&blocked){
     setStatus('install-error',{version:staged.version,percent:100,errorDetail:installDiagnostic()||String(error).slice(0,400)});
    }else{
     setStatus('error',{version:requestedVersion,percent:null,errorDetail:detail});
    }
   }
   if(status.phase==='ready'||status.phase==='current')failures=0;
   return getStatus();
  })();
  try{return await task;}finally{task=null;}
 }
 async function prepareInteractiveRetry(){
  if(task)await task;
  const record=await checkStaged();
  if(!record||status.phase!=='install-error'||status.version!==record.version)return false;
  atomicJSON(attemptsPath,{version:record.version,count:MAX_INSTALL_ATTEMPTS,
   interactiveRequested:true,lastAttempt:new Date().toISOString()});
  return true;
 }
 async function applyOnNextLaunch(options={}){
  if(!app.isPackaged||process.platform!=='win32')return false;
  // Do not hash a large installer at startup when it cannot be installed.
  const candidate=approvedStagedRecord(readJSON(metadataPath),app.getVersion());
  if(!candidate||(options.expectedVersion&&candidate.version!==options.expectedVersion)){
   if(options.expectedVersion)setStatus('install-error',{version:options.expectedVersion,errorDetail:'UPDATE_VERSION_CHANGED_OR_NOT_STAGED'});
   return false;
  }
  const attempt=readJSON(attemptsPath);
  const previous=attempt?.version===candidate.version?Number(attempt.count)||0:0;
  const interactive=options.interactive===true||(attempt?.version===candidate.version&&attempt.interactiveRequested===true);
  if(previous>=MAX_INSTALL_ATTEMPTS&&!interactive){
   setStatus('install-error',{version:candidate.version,percent:100,errorDetail:installDiagnostic()||'INSTALL_ATTEMPTS_EXHAUSTED'});
   return false;
  }
  const record=await checkStaged(); // SHA-256 verification still mandatory before installation.
  if(!record||record.version!==candidate.version){
   setStatus('install-error',{version:candidate.version,errorDetail:'UPDATE_FILE_VERIFICATION_FAILED'});
   return false;
  }
  atomicJSON(attemptsPath,{version:record.version,count:interactive?MAX_INSTALL_ATTEMPTS:previous+1,
   lastAttempt:new Date().toISOString()});
  try{fs.rmSync(path.join(cacheDir,'install-result.txt'),{force:true});}catch{}
  const started=await launchInstaller({
   oldPid:process.pid,installer:record.file,appExecutable:process.execPath,expectedVersion:record.version,interactive,expectedDigest:record.digest
  });
  if(!started){
   setStatus('install-error',{version:record.version,percent:100,errorDetail:'INSTALL_HELPER_START_FAILED'});
   return false;
  }
  return true;
 }
 function start(){
  if(!app.isPackaged||process.platform!=='win32'){setStatus('disabled');return;}
  stopped=false;
  const schedule=()=>{
   if(stopped)return;
   timer=setTimeout(async()=>{await checkNow();schedule();},Math.min(RECHECK_MS,failures?30000*2**Math.min(failures-1,4):RECHECK_MS));
   timer.unref?.();
  };
  void checkNow().finally(schedule);
 }
 function stop(){
  stopped=true;
  if(timer){clearTimeout(timer);timer=null;}
 }
 return {getStatus,checkNow,prepareInteractiveRetry,applyOnNextLaunch,start,stop,
  _test:{cacheDir,metadataPath,attemptsPath,checkStaged}};
}
module.exports={createDesktopUpdateService,verifiedFile,powershellInstallCommand,
 startDetachedInstaller};
