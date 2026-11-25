import React,{useEffect,useState} from 'react';
import {Minus,Square,Copy,X} from 'lucide-react';

type WindowState={maximized:boolean};
type WindowApi={
 isElectron?:boolean;
 platform?:string;
 controlWindow?:(action:'minimize'|'toggle-maximize'|'close')=>Promise<boolean>;
 getWindowState?:()=>Promise<WindowState>;
 onWindowState?:(listener:(state:WindowState)=>void)=>()=>void;
};
const nativeApi=()=> (globalThis as unknown as {electronAPI?:WindowApi}).electronAPI;
export const isNativeWindow=()=>Boolean(nativeApi()?.isElectron&&nativeApi()?.platform==='win32'&&nativeApi()?.controlWindow);
export const windowDragStyle:React.CSSProperties={WebkitAppRegion:'drag'} as React.CSSProperties;
const noDrag={WebkitAppRegion:'no-drag'} as React.CSSProperties;

export const DesktopWindowControls:React.FC=()=>{
 const [maximized,setMaximized]=useState(false);
 const [closing,setClosing]=useState(false);
 useEffect(()=>{
  const api=nativeApi();
  if(!isNativeWindow())return;
  let mounted=true;
  const unsubscribe=api?.onWindowState?.(state=>{if(mounted)setMaximized(state.maximized);});
  void api?.getWindowState?.().then(state=>{if(mounted)setMaximized(state.maximized);}).catch(()=>{});
  return()=>{mounted=false;unsubscribe?.();};
 },[]);
 if(!isNativeWindow())return null;
 const action=async(action:'minimize'|'toggle-maximize'|'close')=>{
  if(action==='close'&&closing)return;
  if(action==='close')setClosing(true);
  try{await nativeApi()?.controlWindow?.(action);}
  catch{window.alert('تعذر تنفيذ أمر النافذة.');}
  finally{if(action==='close')setClosing(false);}
 };
 const common='h-5 w-7 rounded-sm flex items-center justify-center text-white bg-white/10 hover:bg-white/25 shrink-0 focus-visible:ring-2 focus-visible:ring-white';
 return <div className="inline-flex items-center gap-1 shrink-0" style={noDrag}>
  <button type="button" className={common} title="تصغير إلى شريط المهام" aria-label="تصغير النافذة" onClick={()=>void action('minimize')}><Minus className="h-3.5 w-3.5"/></button>
  <button type="button" className={common} title={maximized?'استعادة النافذة':'تكبير النافذة'} aria-label={maximized?'استعادة النافذة':'تكبير النافذة'} onClick={()=>void action('toggle-maximize')}>{maximized?<Copy className="h-3 w-3"/>:<Square className="h-3 w-3"/>}</button>
  <button type="button" disabled={closing} className="h-5 w-8 rounded-sm flex items-center justify-center bg-rose-600 hover:bg-rose-700 text-white shrink-0 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-white" title="إغلاق البرنامج" aria-label="إغلاق البرنامج" onClick={()=>void action('close')}><X className="h-3.5 w-3.5"/></button>
 </div>;
};
export const DesktopLoginTitleBar:React.FC=()=>{
 if(!isNativeWindow())return null;
 return <div dir="rtl" className="fixed top-0 inset-x-0 z-[100] h-7 flex items-center gap-2 px-2 text-white bg-[#123985]">
  <span className="flex-1 min-w-0 truncate text-[11px] font-bold select-none self-stretch flex items-center" style={windowDragStyle}>برنامج الأيهم المحاسبي — مطبعة ومكتبة لبنان — م. رائد صالحة</span>
  <DesktopWindowControls/>
 </div>;
};
