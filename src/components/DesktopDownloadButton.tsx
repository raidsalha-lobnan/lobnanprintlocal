import React,{useEffect,useState} from 'react';
import {Download} from 'lucide-react';

type ReleaseAsset={
  name:string;
  state?:string;
  size?:number;
  browser_download_url:string;
};
type Release={tag_name?:string;draft?:boolean;prerelease?:boolean;assets?:ReleaseAsset[]};

const repo='raidsalha-lobnan/lobnanprintlocal';
const RELEASE_API='https://api.github.com/repos/'+repo+'/releases/latest';
// This installer was published and verified by the Windows CI workflow.
// It remains a working download even when GitHub's API cannot be reached
// from a particular user's browser.
export const VERIFIED_FALLBACK_WINDOWS_INSTALLER=
  'https://github.com/'+repo+'/releases/download/desktop-v1.1.7/LobnanPrint-Setup-1.1.7.exe';

function validOfficialInstaller(release:Release|null):string|null{
  if(!release || release.draft || release.prerelease)return null;
  const version=/^desktop-v(\d+\.\d+\.\d+)$/.exec(String(release.tag_name||''))?.[1];
  if(!version)return null;
  const name='LobnanPrint-Setup-'+version+'.exe';
  const expected='https://github.com/'+repo+'/releases/download/desktop-v'+version+'/'+name;
  const asset=release.assets?.find(x=>x.name===name &&
    x.state==='uploaded' && Number(x.size)>20_000_000 &&
    x.browser_download_url===expected);
  return asset?expected:null;
}

/**
 * Always show a real install button at the TOP of the app's first toolbar.
 * A blocked GitHub API is never allowed to make this button disappear.
 * This installs a native Windows app; it is not the Chrome PWA shortcut.
 */
export const DesktopDownloadButton:React.FC=()=>{
  const [download,setDownload]=useState(VERIFIED_FALLBACK_WINDOWS_INSTALLER);
  const isElectron=Boolean((globalThis as unknown as {
    electronAPI?:{isElectron?:boolean}
  }).electronAPI?.isElectron);
  const isWindows=typeof navigator!=='undefined' &&
    /Windows|Win64|Win32|WinNT/i.test(navigator.userAgent);

  useEffect(()=>{
    if(isElectron||!isWindows)return;
    const controller=new AbortController();
    void fetch(RELEASE_API,{
      cache:'no-store',
      signal:controller.signal,
      headers:{Accept:'application/vnd.github+json'}
    }).then(async response=>response.ok?await response.json() as Release:null)
      .then(release=>{
        const current=validOfficialInstaller(release);
        if(current)setDownload(current);
      }).catch(()=>{/* Keep the verified fallback installer. */});
    return()=>controller.abort();
  },[isElectron,isWindows]);

  if(isElectron || !isWindows)return null;

  return (
    <a href={download} target="_blank" rel="noopener noreferrer"
      aria-label="تحميل وتثبيت تطبيق Windows بقاعدة SQLite محلية"
      title="تثبيت تطبيق Windows الحقيقي: قاعدة SQLite محلية ثابتة على قرص غير C متى توفر"
      className="h-5 inline-flex shrink-0 items-center gap-1 rounded border border-emerald-300/70 bg-emerald-700 px-2 text-[10px] font-bold text-white hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white">
      <Download className="h-3 w-3 shrink-0"/>
      <span className="hidden xl:inline">تثبيت تطبيق Windows (SQLite)</span>
      <span className="xl:hidden">تثبيت Windows</span>
    </a>
  );
};
