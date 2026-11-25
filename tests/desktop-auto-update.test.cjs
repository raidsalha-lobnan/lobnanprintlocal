'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {officialAsset,compareVersions,approvedStagedRecord}=require('../electron/update-policy.cjs');
const {createDesktopUpdateService,verifiedFile,powershellInstallCommand}=
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
 let launches=0,downloadFetches=0;
 const fetchImpl=async url=>{
  if(url.endsWith('/releases/latest'))return {ok:true,json:async()=>release};
  downloadFetches++;
  return {ok:true,url:'https://release-assets.githubusercontent.com/temporary-asset',
   body:{async *[Symbol.asyncIterator](){
    for(let n=0;n<body.length;n+=64*1024)yield body.subarray(n,n+64*1024);
   }}};
 };
 const app={isPackaged:true,getVersion:()=> '1.1.17'};
 const service=createDesktopUpdateService({
  app,storage:{root:dir},getWindow:()=>null,fetchImpl,
  launchInstaller:async()=>{launches++;return true;}
 });
 try{
  const finished=await service.checkNow();
  assert.equal(finished.phase,'ready');
  assert.equal(finished.version,'1.1.51');
  assert.equal(launches,0,'never launch an installer while the app is open');
  assert.equal(downloadFetches,1);
  assert.equal(await service._test.checkStaged()!=null,true);
  assert.equal(await service.applyOnNextLaunch(),true);
  assert.equal(launches,1);
  assert.equal(await service.applyOnNextLaunch(),true);
  assert.equal(launches,2);
  assert.equal(await service.applyOnNextLaunch(),false,'prevents infinite install loop');
  assert.equal(launches,2);
  const blocked=await service.checkNow();
  assert.equal(blocked.phase,'install-error','same failed version remains blocked');
  assert.equal(downloadFetches,1);
  release=manifest('1.1.52',digest);
  const recovered=await service.checkNow();
  assert.equal(recovered.phase,'ready','newer release supersedes blocked update');
  assert.equal(recovered.version,'1.1.52');
  assert.equal(downloadFetches,2);
  assert.equal(launches,2,'checking must not launch installer');
  assert.equal(await service.applyOnNextLaunch(),true);
  assert.equal(launches,3,'new version receives its own attempt budget');
  assert.equal(fs.existsSync(path.join(dir,'accounting.db')),false,
   'updater never creates/changes a financial database');
 }finally{service.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
