'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {officialAsset,compareVersions,approvedStagedRecord}=require('../electron/update-policy.cjs');
const {createDesktopUpdateService,verifiedFile,powershellInstallCommand,startDetachedInstaller}=
 require('../electron/update-manager.cjs');

function manifest(version='1.1.50',digest='a'.repeat(64)){
 const name='LobnanPrint-Setup-'+version+'.exe';
 return {tag_name:'desktop-v'+version,draft:false,prerelease:false,
  assets:[{name,state:'uploaded',size:20_000_001,digest:'sha256:'+digest,
   browser_download_url:'https://github.com/raidsalha-lobnan/lobnanprintlocal/releases/download/desktop-v'+version+'/'+name}]};
}
test('only newer, digest-verified official releases are eligible for silent install',()=>{
 assert.equal(compareVersions('1.1.17','1.1.18'),-1);
 assert.equal(compareVersions('1.10.0','1.9.99'),1);
 assert.equal(compareVersions('1.1.18','1.1.18'),0);
 assert.equal(officialAsset(manifest('1.1.17'),'1.1.17'),null);
 assert.equal(officialAsset(manifest('1.1.16'),'1.1.17'),null);
 assert.equal(officialAsset(manifest('1.1.18'),'1.1.17').version,'1.1.18');
 assert.equal(officialAsset({...manifest(),draft:true},'1.1.17'),null);
 assert.equal(officialAsset({...manifest(),prerelease:true},'1.1.17'),null);
 assert.equal(officialAsset({...manifest(),assets:[{...manifest().assets[0],digest:null}]},'1.1.17'),null);
 assert.equal(officialAsset({...manifest(),assets:[{...manifest().assets[0],browser_download_url:'https://evil.example/installer.exe'}]},'1.1.17'),null);
 assert.equal(officialAsset({...manifest(),assets:[{...manifest().assets[0],size:5}]},'1.1.17'),null);
 assert.equal(approvedStagedRecord({version:'1.1.20',fileName:'../../bad.exe',size:21_000_000,digest:'b'.repeat(64)},'1.1.17'),null);
});
test('installer helper waits for exit, uses /S only, and never modifies an accounting database',()=>{
 const script=powershellInstallCommand({oldPid:5155,
  installer:"D:\\LobnanPrint\\UpdateCache\\LobnanPrint-Setup-1.1.20.exe",
  appExecutable:"C:\\Users\\test\\AppData\\Local\\Programs\\LobnanPrint\\LobnanPrint.exe"});
 assert.match(script,/Get-Process -Id \$oldPid/);
 assert.match(script,/Start-Process -FilePath \$installer -ArgumentList @\("\/S"\) -Wait/);
 assert.match(script,/Start-Process -FilePath 'C:\\Users\\test/);
 assert.doesNotMatch(script,/Remove-Item|accounting\.db|LobnanPrint\\Data/);
 assert.match(script,/VersionInfo\.FileVersion/);
 assert.match(script,/INSTALLED_VERSION_MISMATCH/);
 assert.match(script,/VERIFIED_INSTALLED/);
 assert.match(script,/install-result\.txt/);
 assert.match(script,/OLD_PROCESS_STILL_RUNNING/);
 assert.match(script,/INSTALLER_EXIT_/);
 assert.throws(()=>powershellInstallCommand({oldPid:1,installer:'invalid.exe',appExecutable:'app.exe'}),/DESKTOP_UPDATE_INVALID_VERSION/);
});
test('SHA256 verification rejects a changed downloaded executable',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lobnan-update-policy-'));
 try{
  const file=path.join(dir,'download.exe'),data=Buffer.from('verified-test-payload');
  fs.writeFileSync(file,data);
  assert.equal(await verifiedFile(file,data.length,crypto.createHash('sha256').update(data).digest('hex')),true);
  assert.equal(await verifiedFile(file,data.length,'0'.repeat(64)),false);
  assert.equal(await verifiedFile(file,data.length+1,crypto.createHash('sha256').update(data).digest('hex')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('background download never launches an installer; next safe app start does',async()=>{
 if(process.platform!=='win32')return;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lobnan-update-service-'));
 const body=Buffer.alloc(20_000_001,65);
 const digest=crypto.createHash('sha256').update(body).digest('hex');
 let release=manifest('1.1.51',digest);
 let launches=0,downloadFetches=0,releaseChecks=0;
 const fetchImpl=async url=>{
  if(url.endsWith('/releases/latest')){releaseChecks++;return {ok:true,json:async()=>release};}
  downloadFetches++;
  return {ok:true,url:'https://release-assets.githubusercontent.com/temporary-asset',
   body:{async *[Symbol.asyncIterator](){
    for(let n=0;n<body.length;n+=64*1024)yield body.subarray(n,n+64*1024);
   }}};
 };
 const app={isPackaged:true,getVersion:()=> '1.1.17'};
 const service=createDesktopUpdateService({
  app,storage:{root:dir},getWindow:()=>null,fetchImpl,
  launchInstaller:async options=>{assert.match(options.expectedVersion,/^\d+\.\d+\.\d+$/);launches++;return true;}
 });
 try{
  const finished=await service.checkNow();
  assert.equal(finished.phase,'ready');
  assert.equal(finished.version,'1.1.51');
  assert.equal(launches,0,'never launch an installer while the app is open');
  assert.equal(downloadFetches,1);
  assert.equal(await service._test.checkStaged()!=null,true);
  const rechecked=await service.checkNow();
  assert.equal(rechecked.phase,'ready');
  assert.equal(releaseChecks,2,'checks for new releases even when a download is staged');
  assert.equal(downloadFetches,1,'does not download the same verified release again');
  assert.equal(await service.applyOnNextLaunch(),true);
  assert.equal(launches,1);
  assert.equal(await service.applyOnNextLaunch(),true);
  assert.equal(launches,2);
  assert.equal(await service.applyOnNextLaunch(),false,'prevents infinite install loop');
  assert.equal(launches,2);
  const blocked=await service.checkNow();
  assert.equal(blocked.phase,'install-error','same failed version remains blocked');
  assert.equal(blocked.errorDetail,'INSTALL_ATTEMPTS_EXHAUSTED');
  assert.equal(downloadFetches,1);
  assert.equal(await service.prepareInteractiveRetry(),true);
  assert.equal(await service.applyOnNextLaunch(),true);
  assert.equal(await service.applyOnNextLaunch(),false,'interactive retry is consumed once');
  assert.equal(launches,3);
  release=manifest('1.1.52',digest);
  const recovered=await service.checkNow();
  assert.equal(recovered.phase,'ready','newer release supersedes blocked update');
  assert.equal(recovered.version,'1.1.52');
  assert.equal(downloadFetches,2);
  assert.equal(launches,3,'checking must not launch installer');
  assert.equal(await service.applyOnNextLaunch(),true);
  assert.equal(launches,4,'new version receives its own attempt budget');
  const restarted=createDesktopUpdateService({app:{isPackaged:true,getVersion:()=> '1.1.52'},storage:{root:dir},getWindow:()=>null,fetchImpl});
  assert.equal(restarted.getStatus().installedVersion,'1.1.52','success is based on actual running version');
  assert.equal(restarted.getStatus().currentVersion,'1.1.52');
  restarted.stop();
  assert.equal(fs.existsSync(path.join(dir,'accounting.db')),false,
   'updater never creates/changes a financial database');
 }finally{service.stop();fs.rmSync(dir,{recursive:true,force:true});}
});

test('interrupted update resumes from saved bytes and verifies full SHA256 before staging',async()=>{
 if(process.platform!=='win32')return;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lobnan-update-resume-'));
 const data=Buffer.alloc(20_000_001,66);
 const digest=crypto.createHash('sha256').update(data).digest('hex');
 const release=manifest('1.1.80',digest);
 const cut=1_048_576;
 let attempts=0,launches=0;
 const service=createDesktopUpdateService({
  app:{isPackaged:true,getVersion:()=> '1.1.60'},storage:{root:dir},getWindow:()=>null,
  launchInstaller:async()=>{launches++;return true;},
  fetchImpl:async(url,options)=>{
   if(url.endsWith('/releases/latest'))return {ok:true,json:async()=>release};
   attempts++;
   if(attempts===1)return {ok:true,status:200,url:'https://release-assets.githubusercontent.com/asset',
    body:{async *[Symbol.asyncIterator](){yield data.subarray(0,cut);throw Error('TEST_CONNECTION_LOST');}}};
   assert.equal(options.headers.Range,'bytes='+cut+'-');
   return {ok:true,status:206,url:'https://release-assets.githubusercontent.com/asset',
    headers:{get:key=>key==='content-range'?'bytes '+cut+'-'+(data.length-1)+'/'+data.length:null},
    body:{async *[Symbol.asyncIterator](){yield data.subarray(cut);}}};
  }
 });
 try{
  const failed=await service.checkNow();
  assert.equal(failed.phase,'error');
  assert.equal(failed.version,'1.1.80');
  assert.match(failed.errorDetail,/TEST_CONNECTION_LOST/);
  assert.equal(await service._test.checkStaged(),null);
  const resumed=await service.checkNow();
  assert.equal(resumed.phase,'ready');
  assert.equal(attempts,2);
  assert.equal(launches,0);
  assert.ok(await service._test.checkStaged());
  assert.equal(fs.readdirSync(service._test.cacheDir).some(x=>x.endsWith('.part')),false);
  assert.match(fs.readFileSync(path.join(service._test.cacheDir,'update-errors.log'),'utf8'),/TEST_CONNECTION_LOST/);
 }finally{service.stop();fs.rmSync(dir,{recursive:true,force:true});}
});

test('explicit recovery opens verified installer visibly without changing database',()=>{
 const script=powershellInstallCommand({oldPid:1,installer:'LobnanPrint-Setup-1.1.80.exe',
  appExecutable:'LobnanPrint.exe',interactive:true});
 assert.match(script,/Start-Process -FilePath \$installer -Wait -PassThru/);
 assert.doesNotMatch(script,/ArgumentList @\("\/S"\)/);
 assert.match(script,/INSTALLED_VERSION_MISMATCH/);
});

test('installer handoff requires worker readiness and verifies the digest again',()=>{
 const script=powershellInstallCommand({oldPid:5155,installer:'LobnanPrint-Setup-1.1.80.exe',
  appExecutable:'LobnanPrint.exe',handshake:'handoff-probe',expectedDigest:'a'.repeat(64)});
 assert.match(script,/Set-Content -LiteralPath \$ready -Value "HELPER_READY"/);
 assert.match(script,/HELPER_HANDOFF_NOT_AUTHORIZED/);
 assert.match(script,/Get-FileHash -LiteralPath \$installer -Algorithm SHA256/);
 assert.match(script,/APP_PROCESS_STILL_RUNNING/);
 assert.ok(script.indexOf('HELPER_HANDOFF_NOT_AUTHORIZED')<script.indexOf('Start-Process -FilePath $installer'));
});
test('Windows helper launcher waits for ready acknowledgement instead of spawn alone',async()=>{
 if(process.platform!=='win32')return;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lobnan-helper-handshake-'));
 const {EventEmitter}=require('node:events');
 try{
  const launched=await startDetachedInstaller({
   oldPid:process.pid,installer:path.join(dir,'LobnanPrint-Setup-1.1.80.exe'),
   appExecutable:path.join(dir,'LobnanPrint.exe'),expectedVersion:'1.1.80'
  },(exe,args,options)=>{
   assert.match(exe,/WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/i);
   assert.equal(options.detached,true);
   const bootstrap=Buffer.from(args.at(-1),'base64').toString('utf16le');
   assert.match(bootstrap,/Start-Process -FilePath/);
   assert.match(bootstrap,/RedirectStandardError/);
   const inner=bootstrap.match(/"-EncodedCommand",'([A-Za-z0-9+/=]+)'/)[1];
   const worker=Buffer.from(inner,'base64').toString('utf16le');
   const ready=worker.match(/\$ready = '([^']+)'/)[1];
   assert.equal(fs.existsSync(ready.replace(/\.ready$/,'.go')),false);
   const child=new EventEmitter();
   child.unref=()=>{};
   setTimeout(()=>{fs.writeFileSync(ready,'HELPER_READY');child.emit('exit',0);},100);
   return child;
  });
  assert.equal(launched,true);
  assert.ok(fs.readdirSync(dir).some(name=>name.endsWith('.go')));
  assert.match(fs.readFileSync(path.join(dir,'install-launcher.log'),'utf8'),/HELPER_READY_HANDOFF_AUTHORIZED/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('differential adapter uses exact versioned feed and never auto-installs',async()=>{
 const {downloadDifferential}=require('../electron/differential-update.cjs');
 const {EventEmitter}=require('node:events');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lobnan-delta-'));
 const data=Buffer.from('verified reconstructed payload');
 const fileName='LobnanPrint-Setup-1.1.82.exe',file=path.join(dir,fileName);
 fs.writeFileSync(file,data);
 const digest=crypto.createHash('sha256').update(data).digest('hex');
 let updater,downloads=0;
 const options={
  app:{getVersion:()=> '1.1.81'},asset:{version:'1.1.82',fileName,size:data.length,digest},
  cacheDir:dir,verifiedFile,fetchImpl:async()=>{throw Error('unexpected baseline fetch');},
  onProgress:()=>{},log:()=>{},
  createUpdater:feed=>{
   assert.match(feed.url,/\/desktop-v1\.1\.82\/$/);
   assert.equal(feed.useMultipleRangeRequest,false);
   updater=new EventEmitter();
   updater.checkForUpdates=async()=>({updateInfo:{version:'1.1.82'}});
   updater.downloadUpdate=async()=>{downloads++;return [file];};
   return updater;
  }
 };
 try{
  assert.equal(await downloadDifferential(options),file);
  assert.equal(updater.autoDownload,false);
  assert.equal(updater.autoInstallOnAppQuit,false);
  assert.equal(updater.disableDifferentialDownload,false);
  assert.equal(updater.disableWebInstaller,true);
  assert.match(updater.previousBlockmapBaseUrlOverride,/\/desktop-v1\.1\.81\/$/);
  assert.equal(downloads,1);
  await assert.rejects(downloadDifferential({...options,asset:{...options.asset,digest:'0'.repeat(64)}}),/DELTA_OFFICIAL_SHA256_MISMATCH/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('verified differential result stages without full HTTP download and without install',async()=>{
 if(process.platform!=='win32')return;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lobnan-delta-stage-'));
 const body=Buffer.alloc(20_000_001,70);
 const digest=crypto.createHash('sha256').update(body).digest('hex');
 const reconstructed=path.join(dir,'reconstructed.exe');
 fs.writeFileSync(reconstructed,body);
 let deltaCalls=0,fullCalls=0,launches=0;
 const service=createDesktopUpdateService({
  app:{isPackaged:true,getVersion:()=> '1.1.81'},storage:{root:dir},getWindow:()=>null,
  launchInstaller:async()=>{launches++;return true;},
  fetchImpl:async url=>{
   if(url.endsWith('/releases/latest'))return {ok:true,json:async()=>manifest('1.1.82',digest)};
   fullCalls++;throw Error('full download not expected');
  },
  differentialDownload:async({onProgress})=>{deltaCalls++;onProgress(50);return reconstructed;}
 });
 try{
  const state=await service.checkNow();
  assert.equal(state.phase,'ready');
  assert.equal(deltaCalls,1);
  assert.equal(fullCalls,0);
  assert.equal(launches,0);
  assert.ok(await service._test.checkStaged());
 }finally{service.stop();fs.rmSync(dir,{recursive:true,force:true});}
});

test('official asset download accepts missing response URL only after explicit allowed redirects',async()=>{
 const {fetchOfficialDownload}=require('../electron/update-manager.cjs');
 const original='https://github.com/raidsalha-lobnan/lobnanprintlocal/releases/download/desktop-v1.1.106/LobnanPrint-Setup-1.1.106.exe';
 const destination='https://release-assets.githubusercontent.com/test-file';
 const visited=[];
 const response=await fetchOfficialDownload(async(url,options)=>{
  visited.push(url);assert.equal(options.redirect,'manual');
  if(url===original)return {status:302,url:'',headers:{get:()=>destination}};
  return {status:206,ok:true,url:'',body:{}};
 },original);
 assert.equal(response.status,206);assert.deepEqual(visited,[original,destination]);
 await assert.rejects(fetchOfficialDownload(async()=>({status:302,headers:{get:()=> 'https://evil.example/download'}}),original),/UNTRUSTED_DOWNLOAD_HOST/);
 await assert.rejects(fetchOfficialDownload(async()=>({status:200,url:'http://github.com/file'}),original),/UNTRUSTED_DOWNLOAD_HOST/);
 await assert.rejects(fetchOfficialDownload(async()=>({status:302,headers:{get:()=>null}}),original),/REDIRECT_LOCATION_MISSING/);
});
