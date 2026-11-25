'use strict';
// Electron Updater is download-only. The existing verified installer handoff
// remains responsible for quitting and restarting the application safely.
const fs=require('node:fs');
const path=require('node:path');
const {REPO_BASE}=require('./update-policy.cjs');
const releaseBase=version=>REPO_BASE+'/releases/download/desktop-v'+version+'/';

async function downloadDifferential({app,asset,cacheDir,fetchImpl,verifiedFile,onProgress,log,createUpdater,resourcesPath=process.resourcesPath}){
 const version=app.getVersion();
 if(!/^\d+\.\d+\.\d+$/.test(version)||!/^\d+\.\d+\.\d+$/.test(asset.version))
  throw Error('DELTA_VERSION_INVALID');
 // The versioned feed is selected from the already validated official GitHub
 // release. Never ask the updater to choose a different release.
 const options={provider:'generic',url:releaseBase(asset.version),useMultipleRangeRequest:false};
 const updater=createUpdater?createUpdater(options):new (require('electron-updater').NsisUpdater)(options);
 updater.autoDownload=false;
 updater.autoInstallOnAppQuit=false;
 updater.autoRunAppAfterInstall=false;
 updater.allowDowngrade=false;
 updater.allowPrerelease=false;
 updater.disableDifferentialDownload=false;
 updater.disableWebInstaller=true;
 updater.previousBlockmapBaseUrlOverride=releaseBase(version);
 updater.logger={info:message=>log(String(message)),warn:message=>log(String(message)),error:message=>log(String(message)),debug:()=>{}};
 updater.on('error',error=>log(String(error)));
 updater.on('download-progress',progress=>onProgress(Math.max(0,Math.min(99,Math.floor(progress.percent||0)))));
 // Our older updater retained installers on the pinned storage disk. Seed
 // Electron Updater's baseline cache only with an exact, official old installer.
 // If absent, Electron Updater safely falls back to a complete download.
 const oldName='LobnanPrint-Setup-'+version+'.exe';
 const oldFile=path.join(cacheDir,oldName);
 try{
  if(fs.existsSync(oldFile)){
   const config=await fs.promises.readFile(path.join(resourcesPath,'app-update.yml'),'utf8');
   const match=/^updaterCacheDirName:\s*['"]?([a-zA-Z0-9._-]+)['"]?\s*$/m.exec(config);
   if(match&&match[1]!=='.'&&match[1]!=='..'&&process.env.LOCALAPPDATA){
    const result=await fetchImpl('https://api.github.com/repos/raidsalha-lobnan/lobnanprintlocal/releases/tags/desktop-v'+version,{
     headers:{Accept:'application/vnd.github+json','User-Agent':'LobnanPrint-Windows-Updater'},signal:AbortSignal.timeout(30000)
    });
    if(result.ok){
     const release=await result.json();
     const oldAsset=release.assets?.find(a=>a.name===oldName&&a.browser_download_url===releaseBase(version)+oldName&&a.state==='uploaded');
     if(release.tag_name==='desktop-v'+version&&oldAsset&&/^sha256:[a-f0-9]{64}$/i.test(oldAsset.digest||'')&&
      await verifiedFile(oldFile,oldAsset.size,oldAsset.digest.slice(7).toLowerCase())){
      const updaterCache=path.join(process.env.LOCALAPPDATA,match[1]);
      await fs.promises.mkdir(updaterCache,{recursive:true});
      const baseline=path.join(updaterCache,'installer.exe');
      if(!await verifiedFile(baseline,oldAsset.size,oldAsset.digest.slice(7).toLowerCase()))
       await fs.promises.copyFile(oldFile,baseline);
      log('DELTA_BASELINE_VERIFIED '+version);
     }
    }
   }
  }
 }catch(error){log('DELTA_BASELINE_UNAVAILABLE '+String(error));}
 const result=await updater.checkForUpdates();
 if(!result||result.updateInfo?.version!==asset.version)
  throw Error('DELTA_MANIFEST_VERSION_MISMATCH');
 const files=await updater.downloadUpdate();
 const candidate=files?.find(file=>typeof file==='string'&&path.basename(file)===asset.fileName);
 if(!candidate||!await verifiedFile(candidate,asset.size,asset.digest))
  throw Error('DELTA_OFFICIAL_SHA256_MISMATCH');
 return candidate;
}
module.exports={downloadDifferential,releaseBase};
