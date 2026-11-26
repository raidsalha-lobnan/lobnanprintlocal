'use strict';
// Windows-only integration: real Electron -> real PowerShell worker -> safe
// fixture installer -> fixture app. Never opens the accounting DB or installs
// the production application on the build machine.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
if(process.platform!=='win32')throw Error('WINDOWS_REQUIRED');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lobnan update اختبار-'));
const entry=path.join(process.cwd(),'.update-handoff-smoke-'+process.pid+'.cjs');
(async()=>{
 try{
  const source=path.join(dir,'Fixture.cs'), installer=path.join(dir,'LobnanPrint-Setup-1.1.999.exe'), appExe=path.join(dir,'FixtureApp.exe');
  fs.writeFileSync(source,[
   'using System;',
   'using System.IO;',
   'using System.Reflection;',
   '[assembly: AssemblyFileVersion("1.1.999.0")]',
   'public class Fixture { public static int Main(string[] args) {',
   ' string self=Assembly.GetExecutingAssembly().Location;',
   ' string root=Path.GetDirectoryName(self);',
   ' bool installer=Path.GetFileName(self).StartsWith("LobnanPrint-Setup-");',
   ' string expected=installer?"/S":"--lobnan-update-return";',
   ' if(args.Length!=1 || args[0]!=expected) return 7;',
   ' File.WriteAllText(Path.Combine(root,installer?"fixture-installed.txt":"fixture-reopened.txt"),expected);',
   ' return 0;',
   '} }'
  ].join('\r\n'),'utf8');
  const csc=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  const compiled=spawnSync(csc,['/nologo','/target:exe','/out:'+installer,source],{stdio:'inherit',timeout:30000});
  if(compiled.error||compiled.status!==0)throw Error('UPDATE_FIXTURE_COMPILE_FAILED');
  fs.copyFileSync(installer,appExe);
  const digest=crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
  fs.writeFileSync(entry,[
   "const {app}=require('electron');",
   "const {startDetachedInstaller}=require('./electron/update-manager.cjs');",
   "app.whenReady().then(async()=>{",
   " const accepted=await startDetachedInstaller({oldPid:process.pid,installer:process.env.LOBNAN_TEST_INSTALLER,appExecutable:process.env.LOBNAN_TEST_APP,expectedVersion:'1.1.999',expectedDigest:process.env.LOBNAN_TEST_DIGEST});",
   " app.exit(accepted?0:1);",
   "}).catch(error=>{console.error(error);app.exit(1);});"
  ].join('\n'));
  const env={...process.env,LOBNAN_TEST_INSTALLER:installer,LOBNAN_TEST_APP:appExe,LOBNAN_TEST_DIGEST:digest};
  delete env.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(require('electron'),[entry],{env,stdio:'inherit',timeout:60000});
  if(result.error||result.status!==0)throw Error('ELECTRON_UPDATE_HANDOFF_FAILED');
  const deadline=Date.now()+60000;
  while(Date.now()<deadline&&!fs.existsSync(path.join(dir,'fixture-reopened.txt')))await new Promise(resolve=>setTimeout(resolve,250));
  assert.equal(fs.readFileSync(path.join(dir,'fixture-installed.txt'),'utf8'),'/S');
  assert.equal(fs.readFileSync(path.join(dir,'fixture-reopened.txt'),'utf8'),'--lobnan-update-return');
  assert.match(fs.readFileSync(path.join(dir,'install-result.txt'),'utf8'),/VERIFIED_INSTALLED/);
  assert.match(fs.readFileSync(path.join(dir,'install-launcher.log'),'utf8'),/HELPER_READY_HANDOFF_AUTHORIZED/);
  console.log('REAL_ELECTRON_UPDATE_HANDOFF_OK');
 }catch(error){
  for(const name of ['install-launcher.log','install-helper.log','install-result.txt']){
   const file=path.join(dir,name);if(fs.existsSync(file))console.error(name,fs.readFileSync(file,'utf8'));
  }
  throw error;
 }finally{fs.rmSync(entry,{force:true});fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:300});}
})().catch(error=>{console.error(error);process.exitCode=1;});
