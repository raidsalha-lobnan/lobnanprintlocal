import React,{useEffect,useState} from 'react';
import {Download,Loader2} from 'lucide-react';

type ReleaseAsset={
 name:string;state?:string;size?:number;browser_download_url:string
};
const RELEASE_API='https://api.github.com/repos/raidsalha-lobnan/lobnanprintlocal/releases/tags/desktop-v1.1.0';

/**
 * This is a real Windows (.exe) download, NOT the Chrome PWA shortcut.
 * Never advertise an executable that has not passed the release workflow
 * and been published as a verified GitHub Release asset.
 */
export const DesktopDownloadButton:React.FC=()=>{
 const [link,setLink]=useState<string|null>(null);
 const [status,setStatus]=useState<'checking'|'ready'|'unavailable'>('checking');
 useEffect(()=>{
  const desktop=(globalThis as unknown as {electronAPI?:{isElectron?:boolean}}).electronAPI?.isElectron;
  if(desktop||!/Windows|Win64|Win32|WinNT/i.test(navigator.userAgent)){
   setStatus('unavailable');return;
  }
  const controller=new AbortController();
  void fetch(RELEASE_API,{
   cache:'no-store',signal:controller.signal,
   headers:{Accept:'application/vnd.github+json'}
  }).then(async response=>response.ok?await response.json():null)
   .then(data=>{
    const assets=Array.isArray(data?.assets)?data.assets as ReleaseAsset[]:[];
    const asset=assets.find(x=>
     x.name==='LobnanPrint-Setup-1.1.0.exe'&&x.state==='uploaded'&&
     Number(x.size)>20_000_000&&
     /^https:\/\/github\.com\/raidsalha-lobnan\/lobnanprintlocal\/releases\/download\/desktop-v1\.1\.0\//i.test(x.browser_download_url)
    );
    if(asset){setLink(asset.browser_download_url);setStatus('ready');}
    else setStatus('unavailable');
   }).catch(()=>setStatus('unavailable'));
  return()=>controller.abort();
 },[]);
 const isDesktop=(globalThis as unknown as {electronAPI?:{isElectron?:boolean}}).electronAPI?.isElectron;
 if(isDesktop||!/Windows|Win64|Win32|WinNT/i.test(navigator.userAgent))return null;
 if(status==='ready'&&link)
  return <a href={link} target="_blank" rel="noopener noreferrer"
   title="تحميل تطبيق Windows بقاعدة SQLite محلية في مجلد ثابت"
   className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-900 hover:bg-indigo-100">
    <Download className="h-3.5 w-3.5"/> تحميل تطبيق الكمبيوتر
   </a>;
 // A visible status is more truthful than a broken download link.
 return <span title={status==='checking'?'جاري التأكد من وجود ملف التثبيت':'لم يُنشر ملف التثبيت المعتمد بعد'}
  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
  {status==='checking'?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Download className="h-3.5 w-3.5"/>}
  {status==='checking'?'فحص تطبيق الكمبيوتر':'تطبيق الكمبيوتر قيد الإعداد'}
 </span>;
};
