'use strict';
// Pure release policy. Keep the auto-updater limited to one official GitHub
// repository, a strict versioned NSIS executable and its SHA-256 digest.
const RELEASES_API='https://api.github.com/repos/raidsalha-lobnan/lobnanprintlocal/releases/latest';
const REPO_BASE='https://github.com/raidsalha-lobnan/lobnanprintlocal';
const MIN_INSTALLER_BYTES=20_000_000;
const MAX_INSTALLER_BYTES=450_000_000;
const VERSION_PATTERN=/^\d+\.\d+\.\d+$/;

function parseVersion(version){
 if(typeof version!=='string'||!VERSION_PATTERN.test(version))return null;
 const nums=version.split('.').map(Number);
 return nums.every(x=>Number.isSafeInteger(x)&&x>=0)?nums:null;
}
function compareVersions(a,b){
 const aa=parseVersion(a),bb=parseVersion(b);
 if(!aa||!bb)throw Error('DESKTOP_UPDATE_INVALID_VERSION');
 for(let i=0;i<3;i++)if(aa[i]!==bb[i])return aa[i]<bb[i]?-1:1;
 return 0;
}
function officialAsset(release,currentVersion){
 if(!release||release.draft===true||release.prerelease===true)
  return null;
 const matched=/^desktop-v(\d+\.\d+\.\d+)$/.exec(release.tag_name||'');
 if(!matched||!parseVersion(matched[1])||
    compareVersions(matched[1],currentVersion)<=0)return null;
 const version=matched[1],name='LobnanPrint-Setup-'+version+'.exe';
 const url=REPO_BASE+'/releases/download/desktop-v'+version+'/'+name;
 const asset=(Array.isArray(release.assets)?release.assets:[])
  .find(x=>x?.name===name&&x?.browser_download_url===url&&
    x?.state==='uploaded'&&Number.isSafeInteger(x.size)&&
    x.size>=MIN_INSTALLER_BYTES&&x.size<=MAX_INSTALLER_BYTES&&
    /^sha256:[a-f0-9]{64}$/i.test(String(x.digest||'')));
 if(!asset)return null; // Never auto-run an update without a published digest.
 return {version,fileName:name,url,digest:asset.digest.toLowerCase().slice(7),size:asset.size};
}
function approvedStagedRecord(record,installedVersion){
 if(!record||typeof record!=='object')return null;
 const version=record.version;
 if(!parseVersion(version)||compareVersions(version,installedVersion)<=0)return null;
 const fileName='LobnanPrint-Setup-'+version+'.exe';
 if(record.fileName!==fileName||
    !/^[a-f0-9]{64}$/.test(record.digest||'')||
    !Number.isSafeInteger(record.size)||record.size<MIN_INSTALLER_BYTES||
    record.size>MAX_INSTALLER_BYTES)return null;
 return {version,fileName,digest:record.digest,size:record.size};
}
module.exports={RELEASES_API,REPO_BASE,MIN_INSTALLER_BYTES,MAX_INSTALLER_BYTES,
 compareVersions,officialAsset,approvedStagedRecord};
