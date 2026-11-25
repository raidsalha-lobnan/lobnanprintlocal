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

const RECHECK_MS=6*60*60*1000;
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
function powershellInstallCommand({oldPid,installer,appExecutable}){
 // Never use shell interpolation for downloaded data: paths are produced by
 // our strict filename generator and individually PowerShell-quoted.
 const installerLiteral=safelyQuotedPs(installer);
 const appLiteral=safelyQuotedPs(appExecutable);
 const workdirLiteral=safelyQuotedPs(path.dirname(appExecutable));
 return [
  '$ErrorActionPreference = "Stop"',
  '$log = '+safelyQuotedPs(path.join(path.dirname(installer),'install-helper.log')),
  'try { Start-Transcript -Path $log -Append | Out-Null } catch {}',
  '$oldPid = '+Number(oldPid),
  'for ($i=0; $i -lt 180; $i++) {',
  '  if (-not (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) { break }',
  '  Start-Sleep -Seconds 1',
  '}',
  'if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) { exit 4 }',
  '$installer = '+installerLiteral,
  'if (-not (Test-Path -LiteralPath $installer)) { exit 5 }',
  '$result = Start-Process -FilePath $installer -ArgumentList @("/S") -Wait -PassThru',
  'Write-Output ("Installer exit code: " + $result.ExitCode)',
  'if ($result.ExitCode -ne 0) { exit 6 }',
  'Start-Process -FilePath '+appLiteral+' -WorkingDirectory '+workdirLiteral,
  'exit 0'
 ].join('\r\n');
}
function startDetachedInstaller({oldPid,installer,appExecutable},launch=spawn){
 if(process.platform!=='win32')return Promise.resolve(false);
 const ps=powershellInstallCommand({oldPid,installer,appExecutable});
 const encoded=Buffer.from(ps,'utf16le').toString('base64');
 return new Promise(resolve=>{
  let finished=false;
  let child;
  try{
   child=launch('powershell.exe',
    ['-NoLogo','-NoProfile','-NonInteractive','-WindowStyle','Hidden',
     '-EncodedCommand',encoded],
    {detached:true,stdio:'ignore',windowsHide:true});
  }catch{return resolve(false);}
  const finish=success=>{
   if(finished)return;
   finished=true;
   if(success)child.unref();
   resolve(success);
  };
  child.once('spawn',()=>finish(true));
  child.once('error',()=>finish(false));
 });
}
function createDesktopUpdateService({app,storage,getWindow,launchInstaller=startDetachedInstaller,fetchImpl=fetch}){
 const cacheDir=path.join(storage.root,'UpdateCache');
 const metadataPath=path.join(cacheDir,META_FILE);
 const attemptsPath=path.join(cacheDir,ATTEMPT_FILE);
 let status={phase:'idle',currentVersion:app.getVersion(),version:null,percent:null};
 let task=null,stopped=false,timer=null;
 function setStatus(phase,extra={}){
  status={...status,...extra,phase};
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
 async function stageRelease(asset){
  fs.mkdirSync(cacheDir,{recursive:true});
  const file=path.join(cacheDir,asset.fileName);
  if(await verifiedFile(file,asset.size,asset.digest)){
   atomicJSON(metadataPath,{version:asset.version,
    fileName:asset.fileName,size:asset.size,digest:asset.digest});
   return true;
  }
  const temp=path.join(cacheDir,'.download-'+crypto.randomBytes(9).toString('hex')+'.tmp');
  let handle=null,bytes=0;
  const hash=crypto.createHash('sha256');
  try{
   const response=await fetchImpl(asset.url,{
    headers:{'User-Agent':'LobnanPrint-Windows-Updater'},
    redirect:'follow',signal:AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
   });
   if(!response.ok||!response.body||!
     ALLOWED_DOWNLOAD_HOSTS.has(new URL(response.url).hostname))
    throw Error('DESKTOP_UPDATE_DOWNLOAD_UNTRUSTED_RESPONSE');
   handle=await fs.promises.open(temp,'wx',0o600);
   for await (const piece of response.body){
    const chunk=Buffer.from(piece);
    bytes+=chunk.length;
    if(bytes>asset.size||bytes>450_000_000)
     throw Error('DESKTOP_UPDATE_SIZE_EXCEEDED');
    hash.update(chunk);
    let offset=0;
    while(offset<chunk.length){
     const {bytesWritten}=await handle.write(chunk,offset,chunk.length-offset);
     if(bytesWritten<=0)throw Error('DESKTOP_UPDATE_INCOMPLETE_FILE_WRITE');
     offset+=bytesWritten;
    }
    const percent=Math.floor(bytes*100/asset.size);
    if(percent!==status.percent)
     setStatus('downloading',{version:asset.version,percent});
   }
   if(bytes!==asset.size||hash.digest('hex')!==asset.digest)
    throw Error('DESKTOP_UPDATE_CHECKSUM_INVALID');
   await handle.sync();await handle.close();handle=null;
   await fs.promises.rename(temp,file);
   atomicJSON(metadataPath,{version:asset.version,
    fileName:asset.fileName,size:asset.size,digest:asset.digest});
   return true;
  }finally{
   if(handle)await handle.close().catch(()=>{});
   await fs.promises.rm(temp,{force:true}).catch(()=>{});
  }
 }
 async function checkNow(){
  if(stopped||!app.isPackaged||process.platform!=='win32')return getStatus();
  if(task)return task;
  task=(async()=>{
   try{
    const staged=await checkStaged();
    const attempts=readJSON(attemptsPath);
    const blocked=Boolean(staged&&attempts?.version===staged.version&&
      Number(attempts.count)>=MAX_INSTALL_ATTEMPTS);
    if(staged&&!blocked){
     setStatus('ready',{version:staged.version,percent:100});
     return getStatus();
    }
    // A failed staged release must not prevent future releases from being
    // discovered. Keep the old file intact until a newer asset is verified.
    setStatus('checking',{percent:null,version:null});
    const res=await fetchImpl(RELEASES_API,{
     headers:{Accept:'application/vnd.github+json',
      'User-Agent':'LobnanPrint-Windows-Updater'},
     signal:AbortSignal.timeout(30000),cache:'no-store'
    });
    if(!res.ok)throw Error('DESKTOP_UPDATE_RELEASE_QUERY_'+res.status);
    const release=await res.json();
    const asset=officialAsset(release,app.getVersion());
    if(blocked&&(!asset||compareVersions(asset.version,staged.version)<=0)){
     setStatus('install-error',{version:staged.version,percent:100});
     return getStatus();
    }
    if(!asset){setStatus('current',{version:null,percent:null});return getStatus();}
    setStatus('downloading',{version:asset.version,percent:0});
    await stageRelease(asset);
    setStatus('ready',{version:asset.version,percent:100});
   }catch(error){
    console.warn('DESKTOP_UPDATE_CHECK_FAILED',String(error));
    setStatus('error',{version:null,percent:null});
   }
   return getStatus();
  })();
  try{return await task;}finally{task=null;}
 }
 async function applyOnNextLaunch(){
  if(!app.isPackaged||process.platform!=='win32')return false;
  const record=await checkStaged(); // SHA-256 verified a SECOND time.
  if(!record)return false;
  const attempt=readJSON(attemptsPath);
  const previous=attempt?.version===record.version?Number(attempt.count)||0:0;
  if(previous>=MAX_INSTALL_ATTEMPTS){
   setStatus('install-error',{version:record.version,percent:100});
   return false; // Stop the retry loop, leave existing app fully usable.
  }
  atomicJSON(attemptsPath,{version:record.version,count:previous+1,
   lastAttempt:new Date().toISOString()});
  const started=await launchInstaller({
   oldPid:process.pid,installer:record.file,appExecutable:process.execPath
  });
  if(!started){
   setStatus('install-error',{version:record.version,percent:100});
   return false;
  }
  return true;
 }
 function start(){
  if(!app.isPackaged||process.platform!=='win32'){setStatus('disabled');return;}
  stopped=false;
  void checkNow();
  timer=setInterval(()=>{void checkNow();},RECHECK_MS);
  timer.unref?.();
 }
 function stop(){
  stopped=true;
  if(timer){clearInterval(timer);timer=null;}
 }
 return {getStatus,checkNow,applyOnNextLaunch,start,stop,
  _test:{cacheDir,metadataPath,attemptsPath,checkStaged}};
}
module.exports={createDesktopUpdateService,verifiedFile,powershellInstallCommand,
 startDetachedInstaller};
