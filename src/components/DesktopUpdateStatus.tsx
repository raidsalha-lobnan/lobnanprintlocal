import React,{useEffect,useState} from 'react';
import {RefreshCw,DownloadCloud,ShieldCheck,AlertTriangle} from 'lucide-react';

type UpdatePhase='idle'|'checking'|'downloading'|'ready'|'current'|'error'|
  'install-error'|'disabled';
type UpdateStatus={
 phase:UpdatePhase;
 version?:string|null;
 currentVersion?:string;
 percent?:number|null;
};
type UpdateApi={
 isElectron?:boolean;
 getDesktopUpdateStatus?:()=>Promise<UpdateStatus>;
 checkDesktopUpdate?:()=>Promise<UpdateStatus>;
 onDesktopUpdateStatus?:(listener:(status:UpdateStatus)=>void)=>()=>void;
};
const api=(globalThis as unknown as {electronAPI?:UpdateApi}).electronAPI;

/**
 * Native-only updater status. Does not force an update, reload a tab, or
 * install while an invoice is open. The verified update is installed
 * automatically before the NEXT desktop session begins.
 */
export const DesktopUpdateStatus:React.FC=()=>{
 const [status,setStatus]=useState<UpdateStatus>({phase:'idle'});
 useEffect(()=>{
  if(!api?.isElectron)return;
  let mounted=true;
  let unsubscribe:(()=>void)|undefined;
  try{
   unsubscribe=api.onDesktopUpdateStatus?.(value=>{
    if(mounted)setStatus(value);
   });
  }catch{setStatus({phase:'error'});}
  void api.getDesktopUpdateStatus?.()
   .then(value=>{if(mounted)setStatus(value);})
   .catch(()=>{if(mounted)setStatus({phase:'error'});});
  return()=>{mounted=false;unsubscribe?.();};
 },[]);
 if(!api?.isElectron)return null;
 const {phase,version,percent}=status;
 const complete=phase==='ready';
 const busy=phase==='checking'||phase==='downloading';
 const error=phase==='error'||phase==='install-error';
 const label=complete
   ?'تحديث '+version+' جاهز'
   :phase==='downloading'
   ?'تنزيل التحديث '+(Number.isFinite(percent)?percent+'%':'')
   :phase==='checking'?'فحص التحديثات'
   :error?'تحقق من التحديث'
   :phase==='current'?'التطبيق محدّث':'تحديثات Windows';
 const title=complete
   ?'تم تنزيل التحديث والتحقق منه. سيُثبَّت تلقائيًا قبل فتح البرنامج في التشغيل القادم، دون إغلاق الفواتير الحالية.'
   :error
   ?'تعذر فحص أو تثبيت تحديث. برنامج المحاسبة يعمل بصورة طبيعية ولن تتغير قاعدة SQLite.'
   :'يفحص التطبيق تحديثات Windows وينزّلها تلقائيًا؛ لا يُثبَّت أي تحديث أثناء وجود جلسة عمل مفتوحة.';
 return (
  <button type="button" title={title}
   onClick={()=>{void api.checkDesktopUpdate?.().then(setStatus).catch(()=>{
    setStatus({phase:'error'});
   });}}
   className={'inline-flex h-5 shrink-0 items-center gap-1 rounded border px-2 text-[10px] font-bold '+
    (complete?'border-emerald-300 bg-emerald-800 text-white':
     error?'border-amber-300 bg-amber-800 text-white':
     'border-blue-300 bg-blue-800 text-white')}>
   {busy?<RefreshCw className="h-3 w-3 animate-spin"/>:
    error?<AlertTriangle className="h-3 w-3"/>:
    complete?<DownloadCloud className="h-3 w-3"/>:
    <ShieldCheck className="h-3 w-3"/>}
   {label}
  </button>
 );
};
